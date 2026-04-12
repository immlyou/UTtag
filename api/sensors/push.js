const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  // 寫入操作需要 admin 或 API Key 認證
  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "未授權：需要 Admin Token 或 API Key", 401, req);

  const { mac, temperature, humidity, pressure, source, note } = req.body || {};
  if (!mac) return error(res, "缺少 MAC 地址", 400, req);
  if (temperature == null && humidity == null && pressure == null) return error(res, "至少需要一項感測資料", 400, req);

  const { data, error: dbErr } = await supabase
    .from("sensor_data")
    .insert({
      mac: mac.toUpperCase(),
      temperature: temperature ?? null,
      humidity: humidity ?? null,
      pressure: pressure ?? null,
      source: source || "manual",
      note: note || null,
    })
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);

  // 檢查是否超過閾值
  const { data: bindings } = await supabase
    .from("sensor_bindings")
    .select("*")
    .eq("mac", mac.toUpperCase())
    .eq("enabled", true);

  const alerts = [];
  (bindings || []).forEach(b => {
    if ((b.sensor_type === "temperature" || b.sensor_type === "all") && temperature != null) {
      if (b.min_threshold != null && temperature < b.min_threshold) alerts.push({ type: "temp_low", value: temperature, threshold: b.min_threshold, device: b.device_name });
      if (b.max_threshold != null && temperature > b.max_threshold) alerts.push({ type: "temp_high", value: temperature, threshold: b.max_threshold, device: b.device_name });
    }
    if ((b.sensor_type === "humidity" || b.sensor_type === "all") && humidity != null) {
      if (b.min_threshold != null && humidity < b.min_threshold) alerts.push({ type: "humidity_low", value: humidity, threshold: b.min_threshold, device: b.device_name });
      if (b.max_threshold != null && humidity > b.max_threshold) alerts.push({ type: "humidity_high", value: humidity, threshold: b.max_threshold, device: b.device_name });
    }
  });

  // 若有違規，寫入 tenant_alerts（降級：失敗不阻斷回應）
  if (alerts.length > 0) {
    try {
      const macUpper = mac.toUpperCase();

      // 從 client_tags 反查 client_id（取第一筆）
      const { data: clientTagRow } = await supabase
        .from("client_tags")
        .select("client_id")
        .eq("mac", macUpper)
        .limit(1)
        .single();

      if (clientTagRow) {
        const occurredAt = new Date().toISOString();
        const alertRows = alerts.map(a => {
          const metric = a.type.startsWith("temp") ? "temperature" : "humidity";
          const severity = metric === "temperature" ? "warn" : "info";
          return {
            client_id: clientTagRow.client_id,
            mac: macUpper,
            kind: a.type,
            metric,
            value: a.value,
            threshold: a.threshold,
            severity,
            occurred_at: occurredAt,
          };
        });

        const { error: alertErr } = await supabase
          .from("tenant_alerts")
          .upsert(alertRows, { onConflict: "mac,kind,occurred_bucket", ignoreDuplicates: true });

        if (alertErr) {
          console.warn("[push] tenant_alerts upsert failed:", alertErr.message);
        }
      }
    } catch (e) {
      console.warn("[push] tenant_alerts write error:", e.message);
    }
  }

  json(res, { recorded: true, id: data.id, alerts }, 201, req);
};
