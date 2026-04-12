const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

// 允許更新的欄位白名單
const ALLOWED_FIELDS = ["name", "email", "company", "phone", "tier", "status", "notes"];

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "PUT") return error(res, "Method not allowed", 405, req);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const body = req.body || {};
  const id = body.id;
  if (!id) return error(res, "缺少客戶 ID", 400, req);

  // 只允許白名單欄位
  const updates = {};
  ALLOWED_FIELDS.forEach(field => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  if (Object.keys(updates).length === 0) return error(res, "沒有可更新的欄位", 400, req);

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

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, data, 200, req);
};
