/**
 * Password Reset Flow
 * POST /api/tenant/password/forgot
 * POST /api/tenant/password/reset
 * Phase 5e: Password Reset
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { logAudit, getClientIP } = require("../../lib/auth-middleware");
const { sendPasswordResetEmail } = require("../../lib/email");

const APP_URL = process.env.APP_URL || "http://localhost:3030";

/**
 * POST /api/tenant/password/forgot
 * Body: { email }
 * Always returns 200 to prevent user enumeration.
 * Finds user by email; if multiple matches, picks the one with most recent login.
 */
router.post("/forgot", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return error(res, "Email required", 400, req);
  }

  // Always respond success regardless of whether user exists
  const respond = () => json(res, { success: true }, 200, req);

  try {
    // Find user(s) by email, pick most recently logged in
    const { data: users } = await supabase
      .from("tenant_users")
      .select("id, email, status")
      .eq("email", email.toLowerCase())
      .eq("status", "active")
      .order("last_login_at", { ascending: false, nullsFirst: false });

    if (!users || users.length === 0) {
      return respond();
    }

    const user = users[0];

    // Generate 32-byte hex token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const { error: dbErr } = await supabase
      .from("tenant_users")
      .update({
        reset_token: resetToken,
        reset_expires_at: resetExpires.toISOString()
      })
      .eq("id", user.id);

    if (dbErr) {
      console.error("[PasswordReset] Failed to store token:", dbErr.message);
      return respond();
    }

    const resetUrl = `${APP_URL}/password-reset.html?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (emailErr) {
      console.error("[PasswordReset] Failed to send email:", emailErr.message);
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: null,
      target_type: "user",
      target_id: user.id,
      action: "password_reset_requested",
      resource: "tenant_users",
      ip_address: getClientIP(req)
    });

    return respond();
  } catch (err) {
    console.error("[PasswordReset] forgot error:", err.message);
    return respond();
  }
});

/**
 * POST /api/tenant/password/reset
 * Body: { token, new_password }
 */
router.post("/reset", async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return error(res, "Token and new_password required", 400, req);
  }

  if (new_password.length < 8) {
    return error(res, "Password must be at least 8 characters", 400, req);
  }

  try {
    // Find user with valid (non-expired) reset token
    const { data: users } = await supabase
      .from("tenant_users")
      .select("id, email, client_id")
      .eq("reset_token", token)
      .gt("reset_expires_at", new Date().toISOString());

    if (!users || users.length === 0) {
      return error(res, "Token 無效或已過期", 400, req);
    }

    const user = users[0];
    const passwordHash = await bcrypt.hash(new_password, 10);

    const { error: dbErr } = await supabase
      .from("tenant_users")
      .update({
        password_hash: passwordHash,
        reset_token: null,
        reset_expires_at: null,
        failed_login_count: 0,
        locked_until: null
      })
      .eq("id", user.id);

    if (dbErr) {
      return error(res, "無法更新密碼，請稍後再試", 500, req);
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "user",
      target_id: user.id,
      action: "password_reset_completed",
      resource: "tenant_users",
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
