/**
 * Tenant Devices API
 * GET/POST/DELETE /api/tenant/devices
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
// S5 POC: read through getUserScopedClient. If SUPABASE_ANON_KEY is set AND
// our JWT_SECRET matches Supabase's JWT secret, PostgREST will enforce RLS
// on this request (phase5b policies). Otherwise this handler transparently
// falls back to the service client and keeps behaving exactly as before.
const { supabase, getUserScopedClient } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth, hasPermission, logAudit, getClientIP } = require("../../lib/auth-middleware");
const { filterFieldsAll } = require("../../lib/field-visibility");

/**
 * GET /api/tenant/devices
 * List devices bound to current tenant
 */
router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  // Read is controlled by the field-visibility policy (see lib/field-visibility.js):
  // caller sees different columns based on role. Mutations (POST/PUT/DELETE) below
  // continue to use hasPermission (devices:bind / devices:update / devices:unbind).

  try {
    // Use the per-request scoped client so RLS kicks in when configured.
    // The explicit .eq('client_id', ...) below is belt-and-braces: it is
    // redundant under RLS but still correct without it.
    const db = getUserScopedClient(req);

    // Get devices
    const { data: devices, error: dbErr } = await db
      .from("client_tags")
      .select("*")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Enrich with latest sensor data
    const macs = devices.map(d => d.mac);
    if (macs.length > 0) {
      const { data: latestData } = await db
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

      return json(res, filterFieldsAll(enriched, "client_tags", user.role), 200, req);
    }

    json(res, filterFieldsAll(devices, "client_tags", user.role), 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/tenant/devices
 * Bind device to current tenant
 */
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "devices:bind")) {
    return error(res, "Permission denied", 403, req);
  }

  const { mac, label } = req.body;

  if (!mac || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)) {
    return error(res, "Invalid MAC address format", 400, req);
  }

  try {
    // Check quota
    const { count } = await supabase
      .from("client_tags")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id);

    const { data: client } = await supabase
      .from("clients")
      .select("max_tags")
      .eq("id", user.client_id)
      .single();

    if (client.max_tags && count >= client.max_tags) {
      return error(res, `Device quota exceeded (${count}/${client.max_tags})`, 403, req);
    }

    const { data: device, error: dbErr } = await supabase
      .from("client_tags")
      .insert({
        client_id: user.client_id,
        mac: mac.toUpperCase(),
        label,
        created_by: user.id
      })
      .select()
      .single();

    if (dbErr) {
      if (dbErr.code === "23505") {
        return error(res, "Device already bound", 409, req);
      }
      return error(res, dbErr.message, 400, req);
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "device",
      target_id: device.id,
      action: "bind",
      resource: "client_tags",
      new_values: { mac: mac.toUpperCase(), label },
      ip_address: getClientIP(req)
    });

    json(res, device, 201, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * PUT /api/tenant/devices/:id
 * Update device label
 */
router.put("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "devices:update")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;
  const { label } = req.body;

  try {
    // Verify device belongs to tenant
    const { data: current } = await supabase
      .from("client_tags")
      .select("*")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (!current) {
      return error(res, "Device not found", 404, req);
    }

    const { data: updated, error: dbErr } = await supabase
      .from("client_tags")
      .update({ label })
      .eq("id", id)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "device",
      target_id: id,
      action: "update",
      resource: "client_tags",
      old_values: { label: current.label },
      new_values: { label },
      ip_address: getClientIP(req)
    });

    json(res, updated, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * DELETE /api/tenant/devices/:id
 * Unbind device
 */
router.delete("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "devices:unbind")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;

  try {
    // Verify device belongs to tenant
    const { data: device } = await supabase
      .from("client_tags")
      .select("*")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (!device) {
      return error(res, "Device not found", 404, req);
    }

    const { error: dbErr } = await supabase
      .from("client_tags")
      .delete()
      .eq("id", id);

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "device",
      target_id: id,
      action: "unbind",
      resource: "client_tags",
      old_values: { mac: device.mac, label: device.label },
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
