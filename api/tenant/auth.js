/**
 * Tenant Auth API
 * POST /api/tenant/auth/login, GET /api/tenant/auth/me, POST /api/tenant/auth/logout
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../../lib/supabase");
const { signToken, json, error } = require("../../lib/auth");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");

// S2 fix: run bcrypt.compare even when user missing, so timing doesn't leak
// account existence. This is a valid bcrypt hash of random data that will never match.
const DUMMY_BCRYPT_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/**
 * POST /api/tenant/auth/login
 * Tenant user login
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return error(res, "Email and password required", 400, req);
  }

  try {
    const { data: user } = await supabase
      .from("tenant_users")
      .select("*, clients(id, name, status, industry)")
      .eq("email", email.toLowerCase())
      .single();

    // S2: always run bcrypt.compare (constant-time) before branching on user existence,
    // so response time doesn't reveal whether the email is registered.
    const hashToCheck = user?.password_hash || DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordValid) {
      // Only increment failed count if the user actually exists; otherwise attackers
      // could lock out arbitrary (nonexistent) emails.
      if (user) {
        const failedCount = (user.failed_login_count || 0) + 1;
        await supabase
          .from("tenant_users")
          .update({
            failed_login_count: failedCount,
            locked_until: failedCount >= 5
              ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
              : null
          })
          .eq("id", user.id);
      }
      return error(res, "Invalid credentials", 401, req);
    }

    // User exists and password matched — now enforce status gates.
    if (user.status !== "active") {
      return error(res, "Account is not active", 403, req);
    }
    if (user.clients.status !== "active") {
      return error(res, "Organization is suspended", 403, req);
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return error(res, "Account is locked. Try again later.", 423, req);
    }

    // Reset failed login count, update last login
    await supabase
      .from("tenant_users")
      .update({
        failed_login_count: 0,
        login_count: (user.login_count || 0) + 1,
        last_login_at: new Date().toISOString()
      })
      .eq("id", user.id);

    // Get permissions for role
    const { data: permissions } = await supabase
      .from("role_permissions")
      .select("permissions(code)")
      .eq("role", user.role);

    const permissionCodes = permissions?.map(p => p.permissions?.code).filter(Boolean) || [];

    // Sign JWT with tenant context (including industry vertical)
    const industry = user.clients.industry || "generic";
    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      client_id: user.client_id,
      client_name: user.clients.name,
      industry,
      role: user.role,
      permissions: permissionCodes,
      type: "tenant_user"
    });

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "login",
      resource: "auth",
      ip_address: getClientIP(req),
      user_agent: req.headers["user-agent"]
    });

    json(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_id: user.client_id,
        client_name: user.clients.name,
        industry
      },
      permissions: permissionCodes
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/tenant/auth/me
 * Get current user info
 */
router.get("/me", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  try {
    const { data: fullUser } = await supabase
      .from("tenant_users")
      .select("id, email, name, role, status, phone, avatar_url, last_login_at, login_count, clients(id, name, company, tier, industry)")
      .eq("id", user.id)
      .single();

    if (!fullUser) {
      return error(res, "User not found", 404, req);
    }

    const industry = fullUser.clients?.industry || "generic";

    // Get permissions + industry defaults in parallel
    const [{ data: permissions }, { data: industryDefaults }] = await Promise.all([
      supabase
        .from("role_permissions")
        .select("permissions(code)")
        .eq("role", user.role),
      supabase
        .from("industry_defaults")
        .select("display_name, features, report_templates, default_primary_color, default_logo_url, temp_min, temp_max, humidity_min, humidity_max")
        .eq("industry", industry)
        .single()
    ]);

    const permissionCodes = permissions?.map(p => p.permissions?.code).filter(Boolean) || [];

    json(res, {
      user: fullUser,
      permissions: permissionCodes,
      industry,
      industry_defaults: industryDefaults || null,
      // null in a normal login, populated when a superadmin impersonated this user.
      impersonated_by: user.impersonated_by || null
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/tenant/auth/logout
 * Logout (log audit entry)
 */
router.post("/logout", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  await logAudit({
    actor_type: "tenant_user",
    actor_id: user.id,
    actor_email: user.email,
    client_id: user.client_id,
    action: "logout",
    resource: "auth",
    ip_address: getClientIP(req)
  });

  json(res, { success: true }, 200, req);
});

/**
 * POST /api/tenant/auth/change-password
 * Change user password
 */
router.post("/change-password", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return error(res, "Current and new password required", 400, req);
  }

  if (new_password.length < 8) {
    return error(res, "Password must be at least 8 characters", 400, req);
  }

  try {
    // Get current hash
    const { data: userData } = await supabase
      .from("tenant_users")
      .select("password_hash")
      .eq("id", user.id)
      .single();

    // Verify current password
    const valid = await bcrypt.compare(current_password, userData?.password_hash || "");
    if (!valid) {
      return error(res, "Current password is incorrect", 401, req);
    }

    // Hash new password
    const newHash = await bcrypt.hash(new_password, 10);

    await supabase
      .from("tenant_users")
      .update({ password_hash: newHash })
      .eq("id", user.id);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "change_password",
      resource: "tenant_users",
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
