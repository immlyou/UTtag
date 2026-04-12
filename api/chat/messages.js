const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  // GET - Get messages for a conversation (paginated)
  if (req.method === "GET") {
    const { conversation_id, limit = 50, before, after } = req.query || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);

    let query = supabase
      .from("messages")
      .select(`
        *,
        chat_users:sender_id (id, name, avatar_url, status)
      `)
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (before) {
      query = query.lt("created_at", before);
    }
    if (after) {
      query = query.gt("created_at", after);
    }

    const { data, error: dbErr } = await query;

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Reverse to get chronological order
    return json(res, (data || []).reverse(), 200, req);
  }

  // POST - Send a message
  if (req.method === "POST") {
    const { conversation_id, sender_id, content, message_type = "text", metadata = {} } = req.body || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);
    if (!sender_id) return error(res, "sender_id is required", 400, req);
    if (!content) return error(res, "content is required", 400, req);

    // Verify sender is participant
    const { data: participant } = await supabase
      .from("conversation_participants")
      .select("*")
      .eq("conversation_id", conversation_id)
      .eq("user_id", sender_id)
      .single();

    if (!participant) {
      return error(res, "Sender is not a participant of this conversation", 403, req);
    }

    // Insert message
    const { data, error: dbErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender_id,
        content,
        message_type,
        metadata,
        read_by: [sender_id] // Sender has read their own message
      })
      .select(`
        *,
        chat_users:sender_id (id, name, avatar_url, status)
      `)
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Update sender's last_read_at
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation_id)
      .eq("user_id", sender_id);

    return json(res, data, 201, req);
  }

  // PUT - Mark messages as read
  if (req.method === "PUT") {
    const { conversation_id, user_id, message_ids } = req.body || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);
    if (!user_id) return error(res, "user_id is required", 400, req);

    // Update participant's last_read_at
    const { error: partErr } = await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation_id)
      .eq("user_id", user_id);

    if (partErr) return error(res, partErr.message, 400, req);

    // If specific message_ids provided, add user to read_by array
    if (message_ids && Array.isArray(message_ids) && message_ids.length > 0) {
      for (const msgId of message_ids) {
        const { data: msg } = await supabase
          .from("messages")
          .select("read_by")
          .eq("id", msgId)
          .single();

        if (msg && !msg.read_by?.includes(user_id)) {
          await supabase
            .from("messages")
            .update({ read_by: [...(msg.read_by || []), user_id] })
            .eq("id", msgId);
        }
      }
    }

    return json(res, { marked_read: true }, 200, req);
  }

  // DELETE - Delete a message (soft delete or owner only)
  if (req.method === "DELETE") {
    const { message_id, user_id } = req.query || {};

    if (!message_id) return error(res, "message_id is required", 400, req);
    if (!user_id) return error(res, "user_id is required", 400, req);

    // Verify ownership
    const { data: msg } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("id", message_id)
      .single();

    if (!msg) return error(res, "Message not found", 404, req);
    if (msg.sender_id !== user_id && !admin) {
      return error(res, "Cannot delete other user's messages", 403, req);
    }

    const { error: dbErr } = await supabase
      .from("messages")
      .delete()
      .eq("id", message_id);

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, { deleted: true }, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
