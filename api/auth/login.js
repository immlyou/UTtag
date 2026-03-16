const crypto = require("crypto");
const { supabase } = require("../../lib/supabase");
const { signToken, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405);

  const { username, password } = req.body || {};
  if (!username || !password) return error(res, "缺少帳號或密碼");

  const hash = crypto.createHash("sha256").update(password).digest("hex");
  const { data } = await supabase
    .from("admins")
    .select("*")
    .eq("username", username)
    .eq("password_hash", hash)
    .single();

  if (!data) return error(res, "帳號或密碼錯誤", 401);

  const token = signToken({ id: data.id, username: data.username, role: data.role });
  json(res, { token, role: data.role, username: data.username });
};
