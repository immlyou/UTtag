const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405);

  const { macs } = req.query || {};

  if (macs) {
    // 取得指定 MAC 的最新資料
    const macList = macs.split(",").map(m => m.trim().toUpperCase());
    const results = [];

    for (const mac of macList) {
      const { data } = await supabase
        .from("sensor_data")
        .select("*")
        .eq("mac", mac)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) results.push(data);
    }
    return json(res, results);
  }

  // 取得所有 MAC 的最新一筆（用 distinct on 模擬）
  const { data: allMacs } = await supabase
    .from("sensor_data")
    .select("mac")
    .order("mac");

  const uniqueMacs = [...new Set((allMacs || []).map(r => r.mac))];
  const results = [];

  for (const mac of uniqueMacs) {
    const { data } = await supabase
      .from("sensor_data")
      .select("*")
      .eq("mac", mac)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) results.push(data);
  }

  json(res, results);
};
