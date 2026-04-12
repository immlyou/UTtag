/**
 * Authentication Middleware for Multi-tenant Management
 * Phase 3: Multi-tenant Admin Panel
 */

const { verifyToken, json, error } = require("./auth");
const { supabase } = require("./supabase");

/**
 * Require Super Admin (system administrator)
 * Checks that the request is from an admin with role='superadmin'
 */
async function requireSuperAdmin(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    error(res, "Authorization required", 401, req);
    return null;
  }

  const token = auth.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    error(res, "Invalid or expired token", 401, req);
    return null;
  }

  // Check if admin user
  if (payload.type === "tenant_user") {
    error(res, "Super admin access required", 403, req);
    return null;
  }

  // Verify admin exists and is superadmin
  const { data: admin } = await supabase
    .from("admins")
    .select("id, username, role")
    .eq("id", payload.id)
    .single();

  if (!admin || admin.role !== "superadmin") {
    error(res, "Super admin access required", 403, req);
    return null;
  }

  return admin;
}

/**
 * Require Tenant Authentication
 * Checks that the request is from a tenant user with valid client_id
 */
async function requireTenantAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    error(res, "Authorization required", 401, req);
    return null;
  }

  const token = auth.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    error(res, "Invalid or expired token", 401, req);
    return null;
  }

  // Must be a tenant user
  if (payload.type !== "tenant_user") {
    error(res, "Tenant user access required", 403, req);
    return null;
  }

  // Verify user exists and is active (also pull industry for vertical gating)
  const { data: user } = await supabase
    .from("tenant_users")
    .select("*, clients(status, industry)")
    .eq("id", payload.id)
    .eq("status", "active")
    .single();

  if (!user) {
    error(res, "User not found or inactive", 403, req);
    return null;
  }

  // Check client status
  if (user.clients.status !== "active") {
    error(res, "Organization is suspended", 403, req);
    return null;
  }

  // Attach user info to request. Prefer the live DB industry over the JWT claim
  // so admin-side changes take effect on the next request without re-login.
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    client_id: user.client_id,
    industry: user.clients.industry || payload.industry || "generic",
    permissions: payload.permissions || [],
    // Only present when a superadmin minted this token via /api/admin/impersonate.
    impersonated_by: payload.impersonated_by || null
  };
}

/**
 * Check if user has specific permission
 */
function hasPermission(user, permissionCode) {
  if (!user || !user.permissions) return false;
  return user.permissions.includes(permissionCode);
}

/**
 * Middleware factory for permission checking
 */
function requirePermission(permissionCode) {
  return async (req, res, next) => {
    const user = await requireTenantAuth(req, res);
    if (!user) return;

    if (!hasPermission(user, permissionCode)) {
      error(res, `Permission denied: ${permissionCode}`, 403, req);
      return;
    }

    req.tenantUser = user;
    next();
  };
}

/**
 * Log audit entry
 */
async function logAudit({
  actor_type,
  actor_id,
  actor_email,
  client_id,
  target_type,
  target_id,
  action,
  resource,
  old_values,
  new_values,
  metadata,
  ip_address,
  user_agent
}) {
  try {
    await supabase.from("audit_logs").insert({
      actor_type,
      actor_id,
      actor_email,
      client_id,
      target_type,
      target_id,
      action,
      resource,
      old_values: old_values || null,
      new_values: new_values || null,
      metadata: metadata || {},
      ip_address: ip_address || null,
      user_agent: user_agent || null
    });
  } catch (err) {
    console.error("[Audit] Failed to log:", err.message);
  }
}

/**
 * Get IP address from request
 */
function getClientIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
         req.headers["x-real-ip"] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         null;
}

module.exports = {
  requireSuperAdmin,
  requireTenantAuth,
  hasPermission,
  requirePermission,
  logAudit,
  getClientIP
};
