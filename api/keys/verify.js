const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405);

  const { key } = req.body || {};
  if (!key) return error(res, "缺少 API Key");

  const { data } = await supabase
    .from("api_keys")
    .select("id, name, status, permissions, rate_limit, daily_limit, expires_at, clients(id, name, tier, status)")
    .eq("key", key)
    .single();

  if (!data) return error(res, "無效的 API Key", 401);
  if (data.status !== "active") return error(res, `Key 已${data.status === "revoked" ? "撤銷" : "過期"}`, 403);
  if (data.expires_at && new Date(data.expires_at) < new Date()) return error(res, "Key 已過期", 403);
  if (data.clients?.status !== "active") return error(res, "客戶帳號已停用", 403);

  // 檢查今日用量
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("usage_daily")
    .select("request_count")
    .eq("api_key_id", data.id)
    .eq("date", today)
    .single();

  const todayCount = usage?.request_count || 0;
  const remaining = data.daily_limit ? data.daily_limit - todayCount : null;

  json(res, {
    valid: true,
    key_id: data.id,
    name: data.name,
    permissions: data.permissions,
    rate_limit: data.rate_limit,
    daily_limit: data.daily_limit,
    daily_used: todayCount,
    daily_remaining: remaining,
    client: data.clients,
  });
};
