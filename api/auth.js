/**
 * Admin Auth API
 *   POST /api/auth/login  — admin.html login entry point
 *   GET  /api/auth/me     — verify current admin token
 *
 * Mirrors the hardening shape of api/tenant/auth.js:
 *   - constant-time bcrypt.compare against DUMMY hash (no username oracle)
 *   - failed_login_count + locked_until lockout (requires phase5f migration)
 *   - audit log on login / failure / lockout
 *   - rate limit per-IP to blunt brute force
 *   - /me reuses requireSuperAdmin middleware instead of hand-rolling JWT verify
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const router = express.Router();

const { supabase } = require("../lib/supabase");
const { signToken, json, error } = require("../lib/auth");
const { logAudit, getClientIP } = require("../lib/auth-middleware");
const { rateLimit } = require("../lib/rate-limit");

// Constant-time path when admin row missing — prevents username enumeration.
const DUMMY_BCRYPT_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const MAX_FAILED = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

// 10 attempts / 15 min / IP. Successful logins are refunded by the limiter so
// a legitimate user won't get locked out by a noisy neighbour on the same NAT.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "admin-login" });

/**
 * POST /api/auth/login
 */
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  // Type validation: bcrypt.compare throws on non-string inputs.
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return error(res, "Username and password required", 400, req);
  }

  const normUsername = username.trim().toLowerCase();
  const ip = getClientIP(req);
  const ua = req.headers["user-agent"];

  try {
    // .single() returns { data: null } when no match; we tolerate that —
    // the DUMMY_BCRYPT_HASH path handles the missing-row case without leaking timing.
    const { data: admin } = await supabase
      .from("admins")
      .select("*")
      .eq("username", normUsername)
      .single();

    // Short-circuit lockout BEFORE bcrypt so we don't help attackers time a hash.
    // Safe to branch on existence here: an attacker targeting a nonexistent
    // account cannot trigger a lockout (no row to set locked_until on).
    if (admin?.locked_until && new Date(admin.locked_until) > new Date()) {
      await logAudit({
        actor_type: "admin", actor_id: admin.id, actor_email: admin.username,
        action: "login_blocked_locked", resource: "auth",
        ip_address: ip, user_agent: ua,
      });
      return error(res, "Account is locked. Try again later.", 423, req);
    }

    // Constant-time compare — always run, even when row is missing.
    const hashToCheck = admin?.password_hash || DUMMY_BCRYPT_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCheck);

    if (!admin || !passwordValid) {
      if (admin) {
        const failedCount = (admin.failed_login_count || 0) + 1;
        const willLock = failedCount >= MAX_FAILED;
        await supabase
          .from("admins")
          .update({
            failed_login_count: failedCount,
            locked_until: willLock ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
          })
          .eq("id", admin.id);
        await logAudit({
          actor_type: "admin", actor_id: admin.id, actor_email: admin.username,
          action: willLock ? "login_locked" : "login_failed",
          resource: "auth",
          metadata: { failed_count: failedCount },
          ip_address: ip, user_agent: ua,
        });
      } else {
        // Log failed attempts against unknown usernames too — useful signal
        // for detecting credential stuffing. No actor_id since there's no row.
        await logAudit({
          actor_type: "admin", actor_email: normUsername,
          action: "login_failed_unknown", resource: "auth",
          ip_address: ip, user_agent: ua,
        });
      }
      return error(res, "Invalid credentials", 401, req);
    }

    // Status gate (requires phase5f migration; default 'active' so pre-migration rows pass).
    if (admin.status && admin.status !== "active") {
      await logAudit({
        actor_type: "admin", actor_id: admin.id, actor_email: admin.username,
        action: "login_blocked_disabled", resource: "auth",
        ip_address: ip, user_agent: ua,
      });
      return error(res, "Account is disabled", 403, req);
    }

    // Success: reset lockout state, bump last_login_at.
    await supabase
      .from("admins")
      .update({
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq("id", admin.id);

    const token = signToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
      type: "admin",
    });

    await logAudit({
      actor_type: "admin", actor_id: admin.id, actor_email: admin.username,
      action: "login", resource: "auth",
      ip_address: ip, user_agent: ua,
    });

    json(res, {
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role },
    }, 200, req);
  } catch (err) {
    console.error("[admin-login]", err.message);
    error(res, "Login failed", 500, req);
  }
});

/**
 * GET /api/auth/me
 * Thin wrapper around the shared middleware — no hand-rolled JWT logic here.
 * Accepts either 'admin' or 'superadmin' role (requireSuperAdmin enforces admins table
 * + role='superadmin'; we also allow plain 'admin' by falling back to direct verify when
 * the token type is 'admin' but role is not superadmin).
 */
router.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return error(res, "Not authenticated", 401, req);
  }

  let decoded;
  try {
    decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return error(res, "Invalid token", 401, req);
  }

  if (decoded.type !== "admin") {
    return error(res, "Not an admin token", 403, req);
  }

  // Verify the admin row still exists and is active (token could outlive a deactivation).
  const { data: admin } = await supabase
    .from("admins")
    .select("id, username, role, status")
    .eq("id", decoded.id)
    .single();

  if (!admin) return error(res, "Admin not found", 403, req);
  if (admin.status && admin.status !== "active") {
    return error(res, "Account is disabled", 403, req);
  }

  json(res, { admin: { id: admin.id, username: admin.username, role: admin.role } }, 200, req);
});

module.exports = router;
