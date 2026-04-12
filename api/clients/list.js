const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const { status, tier, search } = req.query || {};

  let query = supabase
    .from("clients")
    .select("*, api_keys(id, key, name, status, last_used_at)")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (tier) query = query.eq("tier", tier);
  if (search) {
    // 清除 PostgREST filter 特殊字元，防止注入
    const sanitized = search.replace(/[%_().,\\]/g, "");
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,company.ilike.%${sanitized}%`);
    }
  }

  const { data, error: dbErr } = await query;
  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, data, 200, req);
};
