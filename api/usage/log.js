const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  // 寫入操作需要 admin 認證
  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const { api_key_id, client_id, endpoint, method, status_code, response_ms, ip_address } = req.body || {};
  if (!api_key_id || !endpoint) return error(res, "缺少必要欄位", 400, req);

  // 寫入詳細 log
  await supabase.from("usage_logs").insert({ api_key_id, client_id, endpoint, method, status_code, response_ms, ip_address });

  // 使用原子操作更新每日統計，避免 race condition
  const today = new Date().toISOString().slice(0, 10);
  const isError = status_code >= 400;
  const { error: rpcErr } = await supabase.rpc("increment_usage_daily", {
    p_api_key_id: api_key_id,
    p_client_id: client_id || null,
    p_date: today,
    p_response_ms: response_ms || 0,
    p_is_error: isError,
  });

  if (rpcErr) {
    console.error("[usage/log] increment_usage_daily RPC failed:", rpcErr.message);
  }

  json(res, { logged: true }, 200, req);
};
