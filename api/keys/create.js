const crypto = require("crypto");
const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401);

  const { client_id, name, permissions, rate_limit, daily_limit, expires_days } = req.body || {};
  if (!client_id) return error(res, "缺少客戶 ID");

  // 檢查客戶的 key 上限
  const { data: client } = await supabase.from("clients").select("max_keys").eq("id", client_id).single();
  if (!client) return error(res, "客戶不存在");

  const { count } = await supabase.from("api_keys").select("*", { count: "exact", head: true }).eq("client_id", client_id).eq("status", "active");
  if (client.max_keys && count >= client.max_keys) return error(res, `已達 API Key 上限 (${client.max_keys})`);

  const key = `utk_${crypto.randomBytes(24).toString("base64url")}`;
  const expires_at = expires_days ? new Date(Date.now() + expires_days * 86400000).toISOString() : null;

  const { data, error: dbErr } = await supabase
    .from("api_keys")
    .insert({
      client_id,
      key,
      name: name || "Default",
      permissions: permissions || ["read"],
      rate_limit: rate_limit || 60,
      daily_limit: daily_limit || 1000,
      expires_at,
    })
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message);
  json(res, data, 201);
};
