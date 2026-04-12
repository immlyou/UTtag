/**
 * Invite Accept Flow
 * GET  /api/tenant/invite/info?token=XXX
 * POST /api/tenant/invite/accept
 * Phase 5e: Invite Accept
 */

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { logAudit, getClientIP } = require("../../lib/auth-middleware");

/**
 * GET /api/tenant/invite/info?token=XXX
 * Returns invite info so the accept page can show context.
 */
router.get("/info", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return error(res, "Token required", 400, req);
  }

  try {
    const { data: user } = await supabase
      .from("tenant_users")
      .select("email, name, invite_expires_at, clients(name)")
      .eq("invite_token", token)
      .eq("status", "pending")
      .single();

    if (!user) {
      return error(res, "Invite not found", 404, req);
    }

    const expired = user.invite_expires_at
      ? new Date(user.invite_expires_at) < new Date()
      : false;

    json(res, {
      email: user.email,
      name: user.name,
      client_name: user.clients?.name || "",
      expired
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/tenant/invite/accept
 * Body: { token, password }
 */
router.post("/accept", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return error(res, "Token and password required", 400, req);
  }

  if (password.length < 8) {
    return error(res, "Password must be at least 8 characters", 400, req);
  }

  try {
    const { data: users } = await supabase
      .from("tenant_users")
      .select("id, email, client_id, clients(name)")
      .eq("invite_token", token)
      .eq("status", "pending")
      .gt("invite_expires_at", new Date().toISOString());

    if (!users || users.length === 0) {
      return error(res, "邀請連結無效或已過期", 400, req);
    }

    const user = users[0];
    const passwordHash = await bcrypt.hash(password, 10);

    const { error: dbErr } = await supabase
      .from("tenant_users")
      .update({
        password_hash: passwordHash,
        status: "active",
        invite_token: null,
        invite_expires_at: null
      })
      .eq("id", user.id);

    if (dbErr) {
      return error(res, "無法啟用帳號，請稍後再試", 500, req);
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "user",
      target_id: user.id,
      action: "invite_accepted",
      resource: "tenant_users",
      ip_address: getClientIP(req)
    });

    json(res, {
      success: true,
      email: user.email,
      client_name: user.clients?.name || ""
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
