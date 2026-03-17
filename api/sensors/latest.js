const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405);

  const { macs } = req.query || {};

  if (macs) {
    const macList = macs.split(",").map(m => m.trim().toUpperCase()).filter(Boolean);
    if (macList.length === 0) return json(res, []);

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

    return json(res, Object.values(latest));
  }

  // 無指定 MAC → 取得所有 MAC 的最新一筆
  const { data: allData } = await supabase
    .from("sensor_data")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);

  const latest = {};
  (allData || []).forEach(row => {
    if (!latest[row.mac]) latest[row.mac] = row;
  });

  json(res, Object.values(latest));
};
