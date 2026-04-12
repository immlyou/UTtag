const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "PUT") return error(res, "Method not allowed", 405, req);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const { id, name, status, device_type } = req.body || {};
  if (!id) return error(res, "缺少裝置 ID", 400, req);

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (device_type !== undefined) updates.device_type = device_type;

  if (Object.keys(updates).length === 0) return error(res, "沒有可更新的欄位", 400, req);

  const { data, error: dbErr } = await supabase
    .from("devices")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, data, 200, req);
};
