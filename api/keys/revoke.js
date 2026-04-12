const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  const { id } = req.body || {};
  if (!id) return error(res, "缺少 Key ID", 400, req);

  const { data, error: dbErr } = await supabase
    .from("api_keys")
    .update({ status: "revoked" })
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, { message: "已撤銷", key: data }, 200, req);
};
