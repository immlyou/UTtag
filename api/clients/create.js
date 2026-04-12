const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const { name, email, company, phone, tier, notes } = req.body || {};
  if (!name || !email) return error(res, "缺少名稱或 Email", 400, req);

  // 取得方案限制
  const { data: tierData } = await supabase.from("billing_tiers").select("*").eq("tier", tier || "free").single();
  const maxTags = tierData?.max_tags || 10;
  const maxKeys = tierData?.max_keys || 2;

  const { data, error: dbErr } = await supabase
    .from("clients")
    .insert({ name, email, company, phone, tier: tier || "free", max_tags: maxTags, max_keys: maxKeys, notes })
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, data, 201, req);
};
