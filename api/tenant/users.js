/**
 * Tenant Users API
 * GET/POST/PUT/DELETE /api/tenant/users
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth, hasPermission, logAudit, getClientIP } = require("../../lib/auth-middleware");

/**
 * GET /api/tenant/users
 * List users in current tenant
 */
router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:read")) {
    return error(res, "Permission denied", 403, req);
  }

  try {
    const { data: users, error: dbErr } = await supabase
      .from("tenant_users")
      .select("id, email, name, role, status, last_login_at, created_at")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);
    json(res, users, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/tenant/users/:id
 * Get user details
 */
router.get("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:read")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;

  try {
    const { data: targetUser, error: dbErr } = await supabase
      .from("tenant_users")
      .select("id, email, name, role, status, phone, avatar_url, last_login_at, login_count, created_at")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (dbErr || !targetUser) {
      return error(res, "User not found", 404, req);
    }

    json(res, targetUser, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/tenant/users
 * Create/invite user to tenant
 */
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:create")) {
    return error(res, "Permission denied", 403, req);
  }

  const { email, name, role = "user", password } = req.body;

  if (!email || !name) {
    return error(res, "Email and name required", 400, req);
  }

  // Validate role (cannot create admin if not admin)
  if (role === "admin" && user.role !== "admin") {
    return error(res, "Cannot create admin users", 403, req);
  }

  try {
    // Generate invite token if no password provided
    const inviteToken = password ? null : crypto.randomBytes(32).toString("hex");
    const inviteExpires = password ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { data: newUser, error: dbErr } = await supabase
      .from("tenant_users")
      .insert({
        client_id: user.client_id,
        email: email.toLowerCase(),
        name,
        role,
        status: password ? "active" : "pending",
        password_hash: passwordHash,
        invite_token: inviteToken,
        invite_expires_at: inviteExpires?.toISOString(),
        invited_by: user.id
      })
      .select("id, email, name, role, status, created_at")
      .single();

    if (dbErr) {
      if (dbErr.code === "23505") {
        return error(res, "User with this email already exists", 409, req);
      }
      return error(res, dbErr.message, 400, req);
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "user",
      target_id: newUser.id,
      action: "create",
      resource: "tenant_users",
      new_values: { email, name, role },
      ip_address: getClientIP(req)
    });

    json(res, newUser, 201, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * PUT /api/tenant/users/:id
 * Update user
 */
router.put("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:update")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;
  const updates = req.body;

  try {
    // Verify user belongs to same tenant
    const { data: current } = await supabase
      .from("tenant_users")
      .select("*")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (!current) {
      return error(res, "User not found", 404, req);
    }

    // Cannot change role to admin if not admin
    if (updates.role === "admin" && user.role !== "admin") {
      return error(res, "Cannot promote to admin", 403, req);
    }

    // Cannot demote self if only admin
    if (current.id === user.id && updates.role && updates.role !== "admin" && current.role === "admin") {
      const { count } = await supabase
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("client_id", user.client_id)
        .eq("role", "admin")
        .eq("status", "active");

      if (count <= 1) {
        return error(res, "Cannot demote last admin", 400, req);
      }
    }

    const allowedFields = ["name", "role", "status", "phone", "avatar_url"];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowedFields.includes(k))
    );

    const { data: updated, error: dbErr } = await supabase
      .from("tenant_users")
      .update(filtered)
      .eq("id", id)
      .select("id, email, name, role, status")
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "user",
      target_id: id,
      action: "update",
      resource: "tenant_users",
      old_values: current,
      new_values: updated,
      ip_address: getClientIP(req)
    });

    json(res, updated, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * DELETE /api/tenant/users/:id
 * Remove user from tenant
 */
router.delete("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:delete")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;

  try {
    // Cannot delete self
    if (id === user.id) {
      return error(res, "Cannot delete yourself", 400, req);
    }

    // Verify user belongs to same tenant
    const { data: target } = await supabase
      .from("tenant_users")
      .select("*")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (!target) {
      return error(res, "User not found", 404, req);
    }

    const { error: dbErr } = await supabase
      .from("tenant_users")
      .delete()
      .eq("id", id);

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "user",
      target_id: id,
      action: "delete",
      resource: "tenant_users",
      old_values: { email: target.email, name: target.name },
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
