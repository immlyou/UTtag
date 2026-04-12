const { supabase } = require("../../lib/supabase");
const { getClientFromApiKey, cors, json, error } = require("../../lib/auth");

const UTTEC_API = "https://utfind.api.beta.uttec.com.tw/api/v1/tags";
const UTTEC_KEY = process.env.UTTEC_API_KEY || "";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  // 驗證客戶 API Key
  const keyData = await getClientFromApiKey(req);
  if (!keyData) return error(res, "無效的 API Key", 401, req);

  const client = keyData.clients;
  if (!client || client.status !== "active") return error(res, "客戶已停用", 403, req);

  // 檢查每日額度
  const today = new Date().toISOString().slice(0, 10);
  const { data: daily } = await supabase
    .from("usage_daily")
    .select("request_count")
    .eq("api_key_id", keyData.id)
    .eq("date", today)
    .single();

  if (daily && keyData.daily_limit && daily.request_count >= keyData.daily_limit) {
    return error(res, `已超過每日限額 (${keyData.daily_limit} 次)`, 429, req);
  }

  const { action, macs, mac, startTime, endTime } = req.body || {};
  if (!action) return error(res, "缺少 action 參數 (all / latest / history)", 400, req);

  // 查詢此客戶可存取的 TAG
  const { data: allowedTags } = await supabase
    .from("client_tags")
    .select("mac")
    .eq("client_id", client.id);

  const allowedMacs = (allowedTags || []).map(t => t.mac.toUpperCase());

  if (!allowedMacs.length) return error(res, "此帳號尚未綁定任何 TAG", 400, req);

  // 根據 action 轉發請求到 UTTEC
  const startMs = Date.now();
  let uttecBody = { key: UTTEC_KEY };
  let endpoint = action;

  if (action === "all") {
    uttecBody = { key: UTTEC_KEY };
  } else if (action === "latest") {
    const requestedMacs = (macs || []).map(m => m.toUpperCase());
    const filtered = requestedMacs.length
      ? requestedMacs.filter(m => allowedMacs.includes(m))
      : allowedMacs;
    if (!filtered.length) return error(res, "請求的 TAG 不在您的授權範圍內", 403, req);
    uttecBody.macs = filtered;
  } else if (action === "history") {
    const upperMac = (mac || "").toUpperCase();
    if (!allowedMacs.includes(upperMac)) return error(res, "此 TAG 不在您的授權範圍內", 403, req);
    uttecBody.mac = upperMac;
    if (startTime) uttecBody.startTime = startTime;
    if (endTime) uttecBody.endTime = endTime;
  } else {
    return error(res, "不支援的 action，可用: all / latest / history", 400, req);
  }

  try {
    const uttecRes = await fetch(`${UTTEC_API}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uttecBody),
    });
    const uttecData = await uttecRes.json();
    const responseMs = Date.now() - startMs;

    // 記錄使用量
    logUsage(keyData.id, client.id, `/b2b/tags/${action}`, responseMs, uttecRes.status);

    // 過濾結果 — 只回傳客戶有權限的 TAG
    if (action === "all" && uttecData.result) {
      if (Array.isArray(uttecData.result)) {
        uttecData.result = uttecData.result.filter(t =>
          allowedMacs.includes((t.mac || "").toUpperCase())
        );
      }
    }

    json(res, {
      code: uttecData.code || 200,
      result: uttecData.result || uttecData,
      quota: {
        used: (daily?.request_count || 0) + 1,
        limit: keyData.daily_limit,
      },
    }, 200, req);
  } catch (e) {
    logUsage(keyData.id, client.id, `/b2b/tags/${action}`, Date.now() - startMs, 500);
    error(res, `上游 API 錯誤: ${e.message}`, 502, req);
  }
};

// 非同步記錄用量（不阻塞回應），使用原子操作避免 race condition
async function logUsage(apiKeyId, clientId, endpoint, responseMs, statusCode) {
  try {
    await supabase.from("usage_logs").insert({
      api_key_id: apiKeyId,
      client_id: clientId,
      endpoint,
      method: "POST",
      status_code: statusCode,
      response_ms: responseMs,
    });

    const today = new Date().toISOString().slice(0, 10);
    const isError = statusCode >= 400;
    const { error: rpcErr } = await supabase.rpc("increment_usage_daily", {
      p_api_key_id: apiKeyId,
      p_client_id: clientId,
      p_date: today,
      p_response_ms: responseMs,
      p_is_error: isError,
    });

    if (rpcErr) {
      console.error("[b2b/tags] increment_usage_daily RPC failed:", rpcErr.message);
    }
  } catch (e) {
    console.error("[b2b/tags] logUsage failed:", e.message);
  }
}
