/**
 * Tenant API Keys API
 * GET/POST/DELETE /api/tenant/keys
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth, hasPermission, logAudit, getClientIP } = require("../../lib/auth-middleware");

/**
 * Generate API key
 */
function generateApiKey() {
  const prefix = "utk_";
  const randomPart = crypto.randomBytes(24).toString("base64url");
  return prefix + randomPart;
}

/**
 * GET /api/tenant/keys
 * List API keys for current tenant
 */
router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "apikeys:read")) {
    return error(res, "Permission denied", 403, req);
  }

  try {
    const { data: keys, error: dbErr } = await supabase
      .from("api_keys")
      .select("id, name, key, permissions, rate_limit, daily_limit, status, last_used_at, created_at")
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false });

    if (dbErr) return error(res, dbErr.message, 400, req);

    // Mask keys for security (only show first 8 and last 4 chars)
    const masked = keys.map(k => ({
      ...k,
      key_masked: k.key.substring(0, 8) + "..." + k.key.slice(-4)
    }));

    json(res, masked, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/tenant/keys
 * Create API key
 */
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "apikeys:create")) {
    return error(res, "Permission denied", 403, req);
  }

  const { name, permissions = ["read"], rate_limit, daily_limit, expires_at } = req.body;

  if (!name) {
    return error(res, "Name is required", 400, req);
  }

  try {
    // Check quota
    const { count } = await supabase
      .from("api_keys")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id)
      .eq("status", "active");

    const { data: client } = await supabase
      .from("clients")
      .select("max_keys, tier")
      .eq("id", user.client_id)
      .single();

    if (client.max_keys && count >= client.max_keys) {
      return error(res, `API key quota exceeded (${count}/${client.max_keys})`, 403, req);
    }

    // Get tier defaults
    const { data: tierData } = await supabase
      .from("billing_tiers")
      .select("rate_limit, daily_limit")
      .eq("tier", client.tier)
      .single();

    const key = generateApiKey();

    const { data: apiKey, error: dbErr } = await supabase
      .from("api_keys")
      .insert({
        client_id: user.client_id,
        key,
        name,
        permissions,
        rate_limit: rate_limit || tierData?.rate_limit || 60,
        daily_limit: daily_limit || tierData?.daily_limit || 1000,
        expires_at: expires_at || null,
        created_by: user.id
      })
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "api_key",
      target_id: apiKey.id,
      action: "create",
      resource: "api_keys",
      new_values: { name, permissions },
      ip_address: getClientIP(req)
    });

    // Return full key only once on creation
    json(res, {
      ...apiKey,
      key_full: key,
      message: "Save this key now - it will not be shown again"
    }, 201, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * DELETE /api/tenant/keys/:id
 * Revoke API key
 */
router.delete("/:id", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "apikeys:revoke")) {
    return error(res, "Permission denied", 403, req);
  }

  const { id } = req.params;

  try {
    // Verify key belongs to tenant
    const { data: key } = await supabase
      .from("api_keys")
      .select("*")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (!key) {
      return error(res, "API key not found", 404, req);
    }

    const { error: dbErr } = await supabase
      .from("api_keys")
      .update({ status: "revoked" })
      .eq("id", id);

    if (dbErr) return error(res, dbErr.message, 400, req);

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      target_type: "api_key",
      target_id: id,
      action: "revoke",
      resource: "api_keys",
      old_values: { name: key.name, status: key.status },
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
