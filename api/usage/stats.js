const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401);

  const { client_id, api_key_id, days } = req.query || {};
  const range = parseInt(days) || 30;
  const since = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);

  // 總覽統計
  const { count: totalClients } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active");
  const { count: totalKeys } = await supabase.from("api_keys").select("*", { count: "exact", head: true }).eq("status", "active");

  // 每日用量
  let dailyQuery = supabase
    .from("usage_daily")
    .select("*")
    .gte("date", since)
    .order("date", { ascending: true });

  if (client_id) dailyQuery = dailyQuery.eq("client_id", client_id);
  if (api_key_id) dailyQuery = dailyQuery.eq("api_key_id", api_key_id);

  const { data: daily } = await dailyQuery;

  // 計算合計
  const totalRequests = (daily || []).reduce((sum, d) => sum + d.request_count, 0);
  const totalErrors = (daily || []).reduce((sum, d) => sum + d.error_count, 0);
  const avgResponseMs = daily?.length
    ? Math.round((daily || []).reduce((sum, d) => sum + d.avg_response_ms, 0) / daily.length)
    : 0;

  // 各客戶用量排行
  let topQuery = supabase
    .from("usage_daily")
    .select("client_id, clients(name, tier), request_count")
    .gte("date", since)
    .order("request_count", { ascending: false })
    .limit(10);

  const { data: topRaw } = await topQuery;

  // 聚合 top clients
  const clientMap = {};
  (topRaw || []).forEach(r => {
    if (!clientMap[r.client_id]) clientMap[r.client_id] = { client_id: r.client_id, name: r.clients?.name, tier: r.clients?.tier, total: 0 };
    clientMap[r.client_id].total += r.request_count;
  });
  const topClients = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 10);

  json(res, {
    overview: { total_clients: totalClients, total_keys: totalKeys, total_requests: totalRequests, total_errors: totalErrors, avg_response_ms: avgResponseMs },
    daily: daily || [],
    top_clients: topClients,
    range_days: range,
  });
};
