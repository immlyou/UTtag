const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  // GET — 列出綁定（需要 admin 認證）
  if (req.method === "GET") {
    const admin = getAdminFromReq(req);
    if (!admin) return error(res, "未授權", 401, req);

    const { mac } = req.query || {};
    let query = supabase.from("sensor_bindings").select("*").order("created_at", { ascending: false });
    if (mac) query = query.eq("mac", mac.toUpperCase());
    const { data, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  // 以下操作需要 admin 認證
  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401, req);

  // POST — 新增綁定
  if (req.method === "POST") {
    const { mac, sensor_type, device_name, min_threshold, max_threshold } = req.body || {};
    if (!mac || !sensor_type) return error(res, "缺少 MAC 或感測器類型", 400, req);

    const { data, error: dbErr } = await supabase
      .from("sensor_bindings")
      .insert({
        mac: mac.toUpperCase(),
        sensor_type,
        device_name: device_name || null,
        min_threshold: min_threshold ?? null,
        max_threshold: max_threshold ?? null,
      })
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 201, req);
  }

  // DELETE — 刪除綁定
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return error(res, "缺少綁定 ID", 400, req);
    const { error: dbErr } = await supabase.from("sensor_bindings").delete().eq("id", id);
    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, { deleted: true }, 200, req);
  }

  error(res, "Method not allowed", 405, req);
};
