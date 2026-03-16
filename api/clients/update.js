const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }
  if (req.method !== "PUT") return error(res, "Method not allowed", 405);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401);

  const { id, ...updates } = req.body || {};
  if (!id) return error(res, "缺少客戶 ID");

  // 如果升降方案，同步更新限制
  if (updates.tier) {
    const { data: tierData } = await supabase.from("billing_tiers").select("*").eq("tier", updates.tier).single();
    if (tierData) {
      updates.max_tags = tierData.max_tags;
      updates.max_keys = tierData.max_keys;
    }
  }

  const { data, error: dbErr } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message);
  json(res, data);
};
