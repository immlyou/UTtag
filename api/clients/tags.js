const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(200).end(); }

  // GET — 列出客戶綁定的 TAGs（公開，Dashboard 需要）
  if (req.method === "GET") {
    const { client_id } = req.query || {};
    let query = supabase.from("client_tags").select("id, mac, label, client_id, created_at").order("created_at", { ascending: false });
    if (client_id) query = query.eq("client_id", client_id);
    const { data, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message);
    return json(res, data);
  }

  // 以下操作需要 admin 驗證
  const admin = getAdminFromReq(req);
  if (!admin) return error(res, "未授權", 401);

  // POST — 綁定 TAG 給客戶
  if (req.method === "POST") {
    const { client_id, mac, label } = req.body || {};
    if (!client_id || !mac) return error(res, "缺少 client_id 或 mac");

    // 檢查 TAG 上限
    const { data: client } = await supabase
      .from("clients").select("max_tags").eq("id", client_id).single();
    if (!client) return error(res, "客戶不存在");

    const { count } = await supabase
      .from("client_tags").select("*", { count: "exact", head: true })
      .eq("client_id", client_id);
    if (client.max_tags && count >= client.max_tags) {
      return error(res, `已達 TAG 上限 (${client.max_tags})`);
    }

    // 檢查是否已綁定
    const { data: existing } = await supabase
      .from("client_tags")
      .select("id")
      .eq("client_id", client_id)
      .eq("mac", mac.toUpperCase())
      .single();
    if (existing) return error(res, "此 TAG 已綁定給該客戶");

    const { data, error: dbErr } = await supabase
      .from("client_tags")
      .insert({
        client_id,
        mac: mac.toUpperCase(),
        label: label || null,
      })
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message);
    return json(res, data, 201);
  }

  // DELETE — 解除綁定
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return error(res, "缺少綁定 ID");
    const { error: dbErr } = await supabase.from("client_tags").delete().eq("id", id);
    if (dbErr) return error(res, dbErr.message);
    return json(res, { deleted: true });
  }

  error(res, "Method not allowed", 405);
};
