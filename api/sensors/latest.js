const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { dualAuth } = require("../../lib/auth-middleware");

// Fetch latest sensor readings scoped to a specific client's bound MACs
async function handleTenantLatest(req, res, scopeClientId) {
  const { macs: macsParam } = req.query || {};

  // Get MACs bound to this client
  const { data: boundTags } = await supabase
    .from("client_tags")
    .select("mac")
    .eq("client_id", scopeClientId);

  const boundMacs = (boundTags || []).map(t => t.mac);
  if (boundMacs.length === 0) return json(res, [], 200, req);

  // If caller specified MACs, intersect with their bound MACs
  let allowedMacs = boundMacs;
  if (macsParam) {
    const requested = macsParam.split(",").map(m => m.trim().toUpperCase()).filter(Boolean);
    allowedMacs = boundMacs.filter(m => requested.includes(m));
    if (allowedMacs.length === 0) return json(res, [], 200, req);
  }

  const { data: allData } = await supabase
    .from("sensor_data")
    .select("*")
    .in("mac", allowedMacs)
    .order("created_at", { ascending: false });

  const latest = {};
  (allData || []).forEach(row => {
    if (!latest[row.mac]) latest[row.mac] = row;
  });

  return json(res, Object.values(latest), 200, req);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  // Try API Key first (X-API-Key header — existing auth path, unrestricted)
  const apiKeyData = await getClientFromApiKey(req);
  if (!apiKeyData) {
    // No API key — require admin or tenant JWT
    const caller = await dualAuth(req, res);
    if (!caller) return;

    if (caller.kind === "tenant") {
      return handleTenantLatest(req, res, caller.scopeClientId);
    }
    // Admin: fall through to existing unrestricted query below
  }

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
