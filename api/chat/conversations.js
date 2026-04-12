const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  // GET - List conversations for a user
  if (req.method === "GET") {
    const { user_id, conversation_id } = req.query || {};

    // Get single conversation
    if (conversation_id) {
      const { data, error: dbErr } = await supabase
        .from("conversations")
        .select(`
          *,
          conversation_participants (
            user_id,
            role,
            last_read_at,
            chat_users (id, name, avatar_url, status)
          )
        `)
        .eq("id", conversation_id)
        .single();

      if (dbErr) return error(res, dbErr.message, 400, req);
      return json(res, data, 200, req);
    }

    // List all conversations for user
    if (!user_id) return error(res, "user_id is required", 400, req);

    // Get conversations where user is a participant
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user_id);

    if (!participations || participations.length === 0) {
      return json(res, [], 200, req);
    }

    const conversationIds = participations.map(p => p.conversation_id);

    const { data, error: dbErr } = await supabase
      .from("conversations")
      .select(`
        *,
        conversation_participants (
          user_id,
          role,
          last_read_at,
          chat_users (id, name, avatar_url, status)
        ),
        messages (
          id,
          content,
          message_type,
          created_at,
          sender_id,
          read_by
        )
      `)
      .in("id", conversationIds)
      .order("updated_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Process to get unread count and last message
    const processed = data.map(conv => {
      const messages = conv.messages || [];
      const lastMessage = messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const participant = conv.conversation_participants.find(p => p.user_id === user_id);
      const lastReadAt = participant?.last_read_at ? new Date(participant.last_read_at) : new Date(0);

      const unreadCount = messages.filter(m => {
        const msgTime = new Date(m.created_at);
        return msgTime > lastReadAt && m.sender_id !== user_id && !m.read_by?.includes(user_id);
      }).length;

      return {
        ...conv,
        last_message: lastMessage || null,
        unread_count: unreadCount,
        messages: undefined // Remove full messages array
      };
    });

    return json(res, processed, 200, req);
  }

  // POST - Create conversation
  if (req.method === "POST") {
    const { type, name, description, created_by, participant_ids, alert_id, tag_mac } = req.body || {};

    if (!type) return error(res, "type is required", 400, req);
    if (!created_by) return error(res, "created_by is required", 400, req);
    if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
      return error(res, "participant_ids is required", 400, req);
    }

    // Create conversation
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        type,
        name: name || null,
        description: description || null,
        alert_id: alert_id || null,
        tag_mac: tag_mac || null,
        created_by
      })
      .select()
      .single();

    if (convErr) return error(res, convErr.message, 400, req);

    // Add participants
    const participants = participant_ids.map((uid, idx) => ({
      conversation_id: conv.id,
      user_id: uid,
      role: uid === created_by ? "owner" : "member"
    }));

    const { error: partErr } = await supabase
      .from("conversation_participants")
      .insert(participants);

    if (partErr) {
      // Rollback conversation
      await supabase.from("conversations").delete().eq("id", conv.id);
      return error(res, partErr.message, 400, req);
    }

    // Add system message
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      sender_id: created_by,
      content: type === "alert" ? "Alert conversation started" : "Conversation created",
      message_type: "system"
    });

    return json(res, conv, 201, req);
  }

  // PUT - Update conversation
  if (req.method === "PUT") {
    const { conversation_id, name, description } = req.body || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const { data, error: dbErr } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversation_id)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  // DELETE - Delete conversation
  if (req.method === "DELETE") {
    const { conversation_id } = req.query || {};

    if (!conversation_id) return error(res, "conversation_id is required", 400, req);

    const { error: dbErr } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversation_id);

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, { deleted: true }, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
