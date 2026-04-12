const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { dualAuth } = require("../../lib/auth-middleware");

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
      // Tenant: verify the requested MAC is bound to their client
      const { mac } = req.query || {};
      if (!mac) return error(res, "缺少 MAC 地址", 400, req);

      const { data: bound } = await supabase
        .from("client_tags")
        .select("mac")
        .eq("client_id", caller.scopeClientId)
        .eq("mac", mac.toUpperCase())
        .single();

      if (!bound) return error(res, "未授權：此 MAC 不屬於您的帳號", 403, req);
      // MAC is verified — fall through to the existing query logic below
    }
    // Admin: fall through without any MAC restriction
  }

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
