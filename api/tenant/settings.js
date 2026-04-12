/**
 * Tenant Settings API
 * GET /api/tenant/settings  — any active tenant user reads their tenant's settings
 * PUT /api/tenant/settings  — only role=admin writes (branding + notification prefs)
 *
 * Superadmin cross-tenant edits use PUT /api/admin/clients/:id/settings instead.
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");

const EDITABLE_FIELDS = [
  "logo_url",
  "primary_color",
  "company_name_display",
  "alert_email_enabled",
  "quota_warning_threshold",
  "daily_digest_enabled",
];

router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;
  try {
    const { data, error: dbErr } = await supabase
      .from("tenant_settings")
      .select("*")
      .eq("client_id", user.client_id)
      .maybeSingle();
    if (dbErr) return error(res, dbErr.message, 400, req);
    // Return an empty-settings object (not 404) so the frontend can render defaults.
    return json(res, data || { client_id: user.client_id }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

router.put("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;
  if (user.role !== "admin") {
    return error(res, "Only tenant admins can update settings", 403, req);
  }

  const filtered = Object.fromEntries(
    Object.entries(req.body || {}).filter(([k]) => EDITABLE_FIELDS.includes(k))
  );
  if (Object.keys(filtered).length === 0) {
    return error(res, "No editable fields in payload", 400, req);
  }
  // Lightweight validation for color hex.
  if (filtered.primary_color && !/^#[0-9a-fA-F]{6}$/.test(filtered.primary_color)) {
    return error(res, "primary_color must be a #RRGGBB hex string", 400, req);
  }

  try {
    const { data: current } = await supabase
      .from("tenant_settings")
      .select("*")
      .eq("client_id", user.client_id)
      .maybeSingle();

    const { data: updated, error: dbErr } = await supabase
      .from("tenant_settings")
      .upsert(
        { client_id: user.client_id, ...filtered, updated_at: new Date().toISOString() },
        { onConflict: "client_id" }
      )
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "tenant_settings",
      target_id: user.client_id,
      action: "update",
      resource: "tenant_settings",
      old_values: current || {},
      new_values: updated,
      ip_address: getClientIP(req),
    });

    return json(res, updated, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
