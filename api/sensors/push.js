const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405);

  const { mac, temperature, humidity, pressure, source, note } = req.body || {};
  if (!mac) return error(res, "缺少 MAC 地址");
  if (temperature == null && humidity == null && pressure == null) return error(res, "至少需要一項感測資料");

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

  if (dbErr) return error(res, dbErr.message);

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

  json(res, { recorded: true, id: data.id, alerts }, 201);
};
