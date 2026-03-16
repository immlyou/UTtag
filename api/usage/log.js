const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405);

  const { api_key_id, client_id, endpoint, method, status_code, response_ms, ip_address } = req.body || {};
  if (!api_key_id || !endpoint) return error(res, "缺少必要欄位");

  // 寫入詳細 log
  await supabase.from("usage_logs").insert({ api_key_id, client_id, endpoint, method, status_code, response_ms, ip_address });

  // 更新每日統計（upsert）
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("usage_daily")
    .select("*")
    .eq("api_key_id", api_key_id)
    .eq("date", today)
    .single();

  if (existing) {
    const newCount = existing.request_count + 1;
    const newErrors = existing.error_count + (status_code >= 400 ? 1 : 0);
    const newAvg = Math.round((existing.avg_response_ms * existing.request_count + (response_ms || 0)) / newCount);
    await supabase.from("usage_daily").update({ request_count: newCount, error_count: newErrors, avg_response_ms: newAvg }).eq("id", existing.id);
  } else {
    await supabase.from("usage_daily").insert({
      api_key_id, client_id, date: today,
      request_count: 1,
      error_count: status_code >= 400 ? 1 : 0,
      avg_response_ms: response_ms || 0,
    });
  }

  json(res, { logged: true });
};
