/**
 * Admin Clients API
 * GET/POST/PUT/DELETE /api/admin/clients
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireSuperAdmin, logAudit, getClientIP } = require("../../lib/auth-middleware");

/**
 * GET /api/admin/clients
 * List all clients with filtering and pagination
 */
router.get("/", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { status, tier, search, page = 1, per_page = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  try {
    let query = supabase
      .from("clients")
      .select(`
        *,
        api_keys(count),
        client_tags(count),
        tenant_users(count)
      `, { count: "exact" })
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(per_page) - 1);

    if (status) query = query.eq("status", status);
    if (tier) query = query.eq("tier", tier);
    if (search) {
      const sanitized = search.replace(/[%_().,\\]/g, "");
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,company.ilike.%${sanitized}%`);
      }
    }

    const { data, count, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message, 400, req);

    json(res, {
      clients: data,
      total: count,
      page: parseInt(page),
      per_page: parseInt(per_page)
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/clients/:id
 * Get client details
 */
router.get("/:id", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;

  try {
    const { data: client, error: dbErr } = await supabase
      .from("clients")
      .select(`
        *,
        api_keys(count),
        client_tags(count),
        tenant_users(count)
      `)
      .eq("id", id)
      .single();

    if (dbErr || !client) {
      return error(res, "Client not found", 404, req);
    }

    json(res, client, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/admin/clients
 * Create new client
 */
router.post("/", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { name, email, company, phone, tier = "free", notes, industry = "generic" } = req.body;

  if (!name || !email) {
    return error(res, "Name and email are required", 400, req);
  }

  const ALLOWED_INDUSTRIES = ["generic", "cold_chain", "biomedical"];
  if (!ALLOWED_INDUSTRIES.includes(industry)) {
    return error(res, `industry must be one of: ${ALLOWED_INDUSTRIES.join(", ")}`, 400, req);
  }

  try {
    // Get tier limits
    const { data: tierData } = await supabase
      .from("billing_tiers")
      .select("max_tags, max_keys")
      .eq("tier", tier)
      .single();

    const { data: client, error: dbErr } = await supabase
      .from("clients")
      .insert({
        name,
        email,
        company,
        phone,
        tier,
        industry,
        notes,
        max_tags: tierData?.max_tags || 10,
        max_keys: tierData?.max_keys || 2
      })
      .select()
      .single();

    if (dbErr) {
      if (dbErr.code === "23505") {
        return error(res, "Email already exists", 409, req);
      }
      return error(res, dbErr.message, 400, req);
    }

    // Create default tenant settings
    await supabase.from("tenant_settings").insert({ client_id: client.id });

    // Audit log
    await logAudit({
      actor_type: "admin",
      actor_id: admin.id,
      actor_email: admin.username,
      client_id: client.id,
      target_type: "client",
      target_id: client.id,
      action: "create",
      resource: "clients",
      new_values: client,
      ip_address: getClientIP(req),
      user_agent: req.headers["user-agent"]
    });

    json(res, client, 201, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * PUT /api/admin/clients/:id
 * Update client
 */
router.put("/:id", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const updates = req.body;

  try {
    // Get current values for audit
    const { data: current } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (!current) return error(res, "Client not found", 404, req);

    const allowedFields = ["name", "email", "company", "phone", "tier", "industry", "status", "max_tags", "max_keys", "notes"];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowedFields.includes(k))
    );

    // Validate industry if it is being updated.
    if (filtered.industry) {
      const ALLOWED_INDUSTRIES = ["generic", "cold_chain", "biomedical"];
      if (!ALLOWED_INDUSTRIES.includes(filtered.industry)) {
        return error(res, `industry must be one of: ${ALLOWED_INDUSTRIES.join(", ")}`, 400, req);
      }
    }

    const { data: updated, error: dbErr } = await supabase
      .from("clients")
      .update(filtered)
      .eq("id", id)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "admin",
      actor_id: admin.id,
      actor_email: admin.username,
      client_id: id,
      target_type: "client",
      target_id: id,
      action: "update",
      resource: "clients",
      old_values: current,
      new_values: updated,
      ip_address: getClientIP(req)
    });

    json(res, updated, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * DELETE /api/admin/clients/:id
 * Soft-delete client (status = 'deleted')
 */
router.delete("/:id", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;

  try {
    const { data: updated, error: dbErr } = await supabase
      .from("clients")
      .update({ status: "deleted" })
      .eq("id", id)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "admin",
      actor_id: admin.id,
      actor_email: admin.username,
      client_id: id,
      target_type: "client",
      target_id: id,
      action: "delete",
      resource: "clients",
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/clients/:id/users
 * List users for a specific client
 */
router.get("/:id/users", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;

  try {
    const { data: users, error: dbErr } = await supabase
      .from("tenant_users")
      .select("id, email, name, role, status, last_login_at, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);
    json(res, users, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/clients/:id/devices
 * List devices for a specific client
 */
router.get("/:id/devices", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;

  try {
    const { data: devices, error: dbErr } = await supabase
      .from("client_tags")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Enrich with latest sensor data
    const macs = devices.map(d => d.mac);
    if (macs.length > 0) {
      const { data: latestData } = await supabase
        .from("sensor_data")
        .select("mac, temperature, humidity, created_at")
        .in("mac", macs)
        .order("created_at", { ascending: false });

      const latestByMac = {};
      latestData?.forEach(d => {
        if (!latestByMac[d.mac]) latestByMac[d.mac] = d;
      });

      const enriched = devices.map(d => {
        const latest = latestByMac[d.mac];
        let status = "offline";
        if (latest) {
          const diff = Date.now() - new Date(latest.created_at).getTime();
          if (diff < 5 * 60 * 1000) status = "online";
          else if (diff < 60 * 60 * 1000) status = "idle";
        }
        return { ...d, latest_data: latest || null, status };
      });

      return json(res, enriched, 200, req);
    }

    json(res, devices, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/clients/:id/keys
 * List API keys for a specific client
 */
router.get("/:id/keys", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;

  try {
    const { data: keys, error: dbErr } = await supabase
      .from("api_keys")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);
    json(res, keys, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/clients/:id/usage
 * Get usage statistics for a specific client
 */
router.get("/:id/usage", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  try {
    const [
      { count: devicesCount },
      { count: usersCount },
      { count: keysCount },
      { data: dailyUsage },
      { data: client }
    ] = await Promise.all([
      supabase.from("client_tags")
        .select("*", { count: "exact", head: true })
        .eq("client_id", id),
      supabase.from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("client_id", id),
      supabase.from("api_keys")
        .select("*", { count: "exact", head: true })
        .eq("client_id", id)
        .eq("status", "active"),
      supabase.from("usage_daily")
        .select("date, request_count, error_count")
        .eq("client_id", id)
        .gte("date", since)
        .order("date", { ascending: true }),
      supabase.from("clients")
        .select("max_tags, max_keys, tier")
        .eq("id", id)
        .single()
    ]);

    const totalCalls = dailyUsage?.reduce((s, d) => s + d.request_count, 0) || 0;
    const totalErrors = dailyUsage?.reduce((s, d) => s + d.error_count, 0) || 0;

    json(res, {
      summary: {
        devices_bound: devicesCount,
        devices_limit: client?.max_tags,
        users_count: usersCount,
        api_keys_active: keysCount,
        api_keys_limit: client?.max_keys,
        api_calls_period: totalCalls,
        api_errors_period: totalErrors,
        tier: client?.tier
      },
      daily_usage: dailyUsage || []
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
