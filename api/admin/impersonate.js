/**
 * Admin Impersonation API
 * POST /api/admin/impersonate
 *
 * Lets a superadmin mint a short-lived tenant JWT so they can view a
 * specific tenant user's dashboard. The minted token carries an
 * `impersonated_by` claim so downstream audit + the tenant banner can
 * clearly mark it as a masquerade (not a real login).
 *
 * Request body:  { client_id, email }   OR  { tenant_user_id }
 * Response:      { token, user, ttl_seconds }
 *
 * Security notes:
 *   - Requires superadmin (requireSuperAdmin middleware).
 *   - Token TTL is 15 minutes — deliberately much shorter than a real
 *     login (24h). If that's too short for demos, bump via IMPERSONATE_TTL.
 *   - Every call writes an audit log entry so the action is reviewable.
 *   - We do NOT rotate real user passwords or touch failed_login_count.
 */

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { supabase } = require("../../lib/supabase");
const { json, error, JWT_SECRET } = require("../../lib/auth");
const { requireSuperAdmin, logAudit, getClientIP } = require("../../lib/auth-middleware");

const IMPERSONATE_TTL_SECONDS = parseInt(process.env.IMPERSONATE_TTL || "900", 10); // 15 min

router.post("/", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { client_id, email, tenant_user_id } = req.body || {};

  if (!tenant_user_id && !(client_id && email)) {
    return error(res, "Provide tenant_user_id or (client_id + email)", 400, req);
  }

  try {
    // Resolve the target user
    let query = supabase
      .from("tenant_users")
      .select("*, clients(id, name, status, industry)");
    if (tenant_user_id) {
      query = query.eq("id", tenant_user_id);
    } else {
      query = query.eq("client_id", client_id).eq("email", email.toLowerCase());
    }
    const { data: target } = await query.single();

    if (!target) return error(res, "Tenant user not found", 404, req);
    if (target.status !== "active") return error(res, "Target user is not active", 403, req);
    if (target.clients?.status !== "active") return error(res, "Target organization is suspended", 403, req);

    // Pull the target's role permissions, same as a real login.
    const { data: permissions } = await supabase
      .from("role_permissions")
      .select("permissions(code)")
      .eq("role", target.role);
    const permissionCodes = permissions?.map(p => p.permissions?.code).filter(Boolean) || [];

    // Mint token with an explicit impersonation claim.
    const industry = target.clients.industry || "generic";
    const token = jwt.sign({
      id: target.id,
      email: target.email,
      name: target.name,
      client_id: target.client_id,
      client_name: target.clients.name,
      industry,
      role: target.role,
      permissions: permissionCodes,
      type: "tenant_user",
      impersonated_by: {
        admin_id: admin.id,
        admin_username: admin.username,
        started_at: new Date().toISOString(),
      },
    }, JWT_SECRET, { expiresIn: IMPERSONATE_TTL_SECONDS });

    await logAudit({
      actor_type: "admin",
      actor_id: admin.id,
      actor_email: admin.username,
      client_id: target.client_id,
      target_type: "tenant_user",
      target_id: target.id,
      action: "impersonate",
      resource: "tenant_users",
      metadata: { target_email: target.email, ttl_seconds: IMPERSONATE_TTL_SECONDS },
      ip_address: getClientIP(req),
      user_agent: req.headers["user-agent"],
    });

    return json(res, {
      token,
      ttl_seconds: IMPERSONATE_TTL_SECONDS,
      user: {
        id: target.id,
        email: target.email,
        name: target.name,
        role: target.role,
        client_id: target.client_id,
        client_name: target.clients.name,
        industry,
      },
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
