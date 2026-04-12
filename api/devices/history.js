const { supabase } = require("../../lib/supabase");
const { cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  const { device_id, hours, limit: limitStr } = req.query || {};
  if (!device_id) return error(res, "缺少 device_id", 400, req);

  const hoursBack = parseInt(hours) || 24;
  const limit = Math.min(parseInt(limitStr) || 100, 500);
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();

  const { data, error: dbErr } = await supabase
    .from("device_checkins")
    .select("*")
    .eq("device_id", device_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, data, 200, req);
};
