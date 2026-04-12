const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  const { device_name, device_type, device_id, latitude, longitude, nearby_tags } = req.body || {};
  if (!device_id || !device_name) return error(res, "缺少 device_id 或 device_name", 400, req);

  // Upsert 裝置
  const { data: device, error: deviceErr } = await supabase
    .from("devices")
    .upsert({
      identifier: device_id,
      name: device_name,
      device_type: device_type || "pda",
      status: "active",
    }, { onConflict: "identifier" })
    .select()
    .single();

  if (deviceErr) return error(res, deviceErr.message, 400, req);

  const tags = Array.isArray(nearby_tags) ? nearby_tags.filter(t => t.lat && t.lng) : [];

  // 優先使用前端傳來的 GPS 座標，fallback 才用 Tag 質心
  let lat = latitude || null;
  let lng = longitude || null;
  if (!lat && tags.length > 0) {
    lat = tags.reduce((sum, t) => sum + t.lat, 0) / tags.length;
    lng = tags.reduce((sum, t) => sum + t.lng, 0) / tags.length;
  }

  // 寫入打卡紀錄
  const { error: checkinErr } = await supabase
    .from("device_checkins")
    .insert({
      device_id: device.id,
      latitude: lat,
      longitude: lng,
      nearby_tags: tags,
      tag_count: tags.length,
    });

  if (checkinErr) return error(res, checkinErr.message, 400, req);

  json(res, { checked_in: true, device_id: device.id, location: { latitude: lat, longitude: lng }, tag_count: tags.length }, 200, req);
};
