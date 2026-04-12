const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { dualAuth } = require("../../lib/auth-middleware");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  // GET - accepts admin JWT, tenant JWT, or API key (chat_users has no client_id, no extra scoping)
  if (req.method === "GET") {
    const apiKeyData = await getClientFromApiKey(req);
    if (!apiKeyData) {
      const caller = await dualAuth(req, res);
      if (!caller) return;
    }

    const { user_id } = req.query || {};

    if (user_id) {
      const { data, error: dbErr } = await supabase
        .from("chat_users")
        .select("*")
        .eq("id", user_id)
        .single();

      if (dbErr) return error(res, dbErr.message, 400, req);
      return json(res, data, 200, req);
    }

    // List all users
    const { data, error: dbErr } = await supabase
      .from("chat_users")
      .select("*")
      .order("name");

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  // POST / PUT — admin or API key only (mutations stay protected)
  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  // POST - Create or update user
  if (req.method === "POST") {
    const { name, email, avatar_url, role } = req.body || {};

    if (!name) return error(res, "Name is required", 400, req);

    // Check if user exists by email
    if (email) {
      const { data: existing } = await supabase
        .from("chat_users")
        .select("*")
        .eq("email", email)
        .single();

      if (existing) {
        // Update existing user
        const { data, error: dbErr } = await supabase
          .from("chat_users")
          .update({ name, avatar_url, status: "online", last_seen_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select()
          .single();

        if (dbErr) return error(res, dbErr.message, 400, req);
        return json(res, data, 200, req);
      }
    }

    // Create new user
    const { data, error: dbErr } = await supabase
      .from("chat_users")
      .insert({
        name,
        email: email || null,
        avatar_url: avatar_url || null,
        role: admin ? (role || "admin") : "user",
        status: "online",
        last_seen_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 201, req);
  }

  // PUT - Update user status
  if (req.method === "PUT") {
    const { user_id, status, name } = req.body || {};

    if (!user_id) return error(res, "user_id is required", 400, req);

    const updates = { last_seen_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (name) updates.name = name;

    const { data, error: dbErr } = await supabase
      .from("chat_users")
      .update(updates)
      .eq("id", user_id)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
