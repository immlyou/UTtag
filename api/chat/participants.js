const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  // GET - List participants of a conversation
  if (req.method === "GET") {
    const { conversation_id } = req.query || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);

    const { data, error: dbErr } = await supabase
      .from("conversation_participants")
      .select(`
        *,
        chat_users (id, name, avatar_url, status, role)
      `)
      .eq("conversation_id", conversation_id);

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  // POST - Add participant to conversation
  if (req.method === "POST") {
    const { conversation_id, user_id, role = "member" } = req.body || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);
    if (!user_id) return error(res, "user_id is required", 400, req);

    // Check if already participant
    const { data: existing } = await supabase
      .from("conversation_participants")
      .select("*")
      .eq("conversation_id", conversation_id)
      .eq("user_id", user_id)
      .single();

    if (existing) {
      return error(res, "User is already a participant", 400, req);
    }

    const { data, error: dbErr } = await supabase
      .from("conversation_participants")
      .insert({
        conversation_id,
        user_id,
        role
      })
      .select(`
        *,
        chat_users (id, name, avatar_url, status)
      `)
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Add system message
    const { data: user } = await supabase
      .from("chat_users")
      .select("name")
      .eq("id", user_id)
      .single();

    await supabase.from("messages").insert({
      conversation_id,
      sender_id: user_id,
      content: `${user?.name || "User"} joined the conversation`,
      message_type: "system"
    });

    return json(res, data, 201, req);
  }

  // DELETE - Remove participant from conversation
  if (req.method === "DELETE") {
    const { conversation_id, user_id } = req.query || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);
    if (!user_id) return error(res, "user_id is required", 400, req);

    // Get user name before removing
    const { data: user } = await supabase
      .from("chat_users")
      .select("name")
      .eq("id", user_id)
      .single();

    const { error: dbErr } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversation_id)
      .eq("user_id", user_id);

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Add system message
    await supabase.from("messages").insert({
      conversation_id,
      sender_id: user_id,
      content: `${user?.name || "User"} left the conversation`,
      message_type: "system"
    });

    return json(res, { removed: true }, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
