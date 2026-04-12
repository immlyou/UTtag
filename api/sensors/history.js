const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  // 讀取操作需要 admin 或 API Key 認證
  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "未授權：需要 Admin Token 或 API Key", 401, req);

  const { mac, hours, limit: limitStr } = req.query || {};
  if (!mac) return error(res, "缺少 MAC 地址", 400, req);

  const hoursBack = parseInt(hours) || 24;
  const limit = Math.min(parseInt(limitStr) || 500, 2000);
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();

  const { data, error: dbErr } = await supabase
    .from("sensor_data")
    .select("*")
    .eq("mac", mac.toUpperCase())
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (dbErr) return error(res, dbErr.message, 400, req);

  // 統計摘要
  const temps = (data || []).filter(d => d.temperature != null).map(d => parseFloat(d.temperature));
  const humids = (data || []).filter(d => d.humidity != null).map(d => parseFloat(d.humidity));

  const summary = {
    count: data?.length || 0,
    hours: hoursBack,
    temperature: temps.length ? {
      min: Math.min(...temps),
      max: Math.max(...temps),
      avg: parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2)),
    } : null,
    humidity: humids.length ? {
      min: Math.min(...humids),
      max: Math.max(...humids),
      avg: parseFloat((humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(2)),
    } : null,
  };

  json(res, { summary, data }, 200, req);
};
