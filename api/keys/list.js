const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401);

  const { client_id } = req.query || {};

  let query = supabase
    .from("api_keys")
    .select("*, clients(name, email, tier)")
    .order("created_at", { ascending: false });

  if (client_id) query = query.eq("client_id", client_id);

  const { data, error: dbErr } = await query;
  if (dbErr) return error(res, dbErr.message);
  json(res, data);
};
