const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  const { status } = req.query || {};

  // 取得所有裝置 + 最後一筆打卡紀錄
  let query = supabase
    .from("devices")
    .select("*")
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data: devices, error: dbErr } = await query;
  if (dbErr) return error(res, dbErr.message, 400, req);

  // 取每台裝置的最後打卡
  const result = await Promise.all((devices || []).map(async (device) => {
    const { data: lastCheckin } = await supabase
      .from("device_checkins")
      .select("*")
      .eq("device_id", device.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return {
      ...device,
      last_checkin: lastCheckin || null,
    };
  }));

  json(res, result, 200, req);
};
