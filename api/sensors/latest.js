const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  // 讀取操作需要 admin 或 API Key 認證
  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "未授權：需要 Admin Token 或 API Key", 401, req);

  const { macs } = req.query || {};

  if (macs) {
    const macList = macs.split(",").map(m => m.trim().toUpperCase()).filter(Boolean);
    if (macList.length === 0) return json(res, [], 200, req);

    // 用 in 一次查所有 MAC 的最新資料，取代逐一 loop
    const { data: allData } = await supabase
      .from("sensor_data")
      .select("*")
      .in("mac", macList)
      .order("created_at", { ascending: false });

    // 每個 MAC 只保留最新一筆
    const latest = {};
    (allData || []).forEach(row => {
      if (!latest[row.mac]) latest[row.mac] = row;
    });

    return json(res, Object.values(latest), 200, req);
  }

  // 無指定 MAC → 用 RPC 或限制查詢取得每個 MAC 的最新一筆
  // 先取所有不重複的 MAC，再逐一取最新（避免撈大量資料再 JS 過濾）
  const { data: distinctMacs } = await supabase
    .from("sensor_data")
    .select("mac")
    .limit(500);

  const uniqueMacs = [...new Set((distinctMacs || []).map(r => r.mac))];

  if (uniqueMacs.length === 0) return json(res, [], 200, req);

  // 批次取每個 MAC 最新一筆
  const { data: allData } = await supabase
    .from("sensor_data")
    .select("*")
    .in("mac", uniqueMacs)
    .order("created_at", { ascending: false });

  const latest = {};
  (allData || []).forEach(row => {
    if (!latest[row.mac]) latest[row.mac] = row;
  });

  json(res, Object.values(latest), 200, req);
};
