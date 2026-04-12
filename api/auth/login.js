const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { supabase } = require("../../lib/supabase");
const { signToken, cors, json, error } = require("../../lib/auth");

// Dummy hash for constant-time path when admin missing (masks timing oracle).
const DUMMY_BCRYPT_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const MAX_FAILED = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  const { username, password } = req.body || {};
  if (!username || !password) return error(res, "缺少帳號或密碼", 400, req);

  const { data } = await supabase
    .from("admins")
    .select("*")
    .eq("username", username)
    .single();

  // S1: refuse login immediately if account is locked out.
  if (data?.locked_until && new Date(data.locked_until) > new Date()) {
    return error(res, "帳號已暫時鎖定，請稍後再試", 423, req);
  }

  // Constant-time branch: always run a hash comparison, even if admin row missing.
  let passwordValid = false;
  const storedHash = data?.password_hash;

  if (!storedHash) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
    passwordValid = false;
  } else if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    passwordValid = await bcrypt.compare(password, storedHash);
  } else {
    // Legacy SHA-256 → auto-upgrade to bcrypt on success.
    const sha256Hash = crypto.createHash("sha256").update(password).digest("hex");
    passwordValid = (sha256Hash === storedHash);
    if (passwordValid) {
      const bcryptHash = await bcrypt.hash(password, 12);
      await supabase.from("admins").update({ password_hash: bcryptHash }).eq("id", data.id);
    }
  }

  if (!passwordValid) {
    if (data) {
      const failedCount = (data.failed_login_count || 0) + 1;
      await supabase.from("admins").update({
        failed_login_count: failedCount,
        locked_until: failedCount >= MAX_FAILED
          ? new Date(Date.now() + LOCKOUT_MS).toISOString()
          : null
      }).eq("id", data.id);
    }
    return error(res, "帳號或密碼錯誤", 401, req);
  }

  // Success: reset lockout state.
  await supabase.from("admins").update({
    failed_login_count: 0,
    locked_until: null,
    last_login_at: new Date().toISOString()
  }).eq("id", data.id);

  const token = signToken({ id: data.id, username: data.username, role: data.role });
  json(res, { token, role: data.role, username: data.username }, 200, req);
};
