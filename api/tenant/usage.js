/**
 * Tenant Usage API
 * GET /api/tenant/usage
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const { supabase, getUserScopedClient } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth, hasPermission } = require("../../lib/auth-middleware");

/**
 * GET /api/tenant/usage
 * Get usage statistics for current tenant
 */
router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "analytics:read")) {
    return error(res, "Permission denied", 403, req);
  }

  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  try {
    const db = getUserScopedClient(req);
    const [
      { count: devicesCount },
      { count: usersCount },
      { count: keysCount },
      { data: dailyUsage },
      { data: client }
    ] = await Promise.all([
      db.from("client_tags")
        .select("*", { count: "exact", head: true })
        .eq("client_id", user.client_id),
      db.from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("client_id", user.client_id),
      db.from("api_keys")
        .select("*", { count: "exact", head: true })
        .eq("client_id", user.client_id)
        .eq("status", "active"),
      db.from("usage_daily")
        .select("date, request_count, error_count")
        .eq("client_id", user.client_id)
        .gte("date", since)
        .order("date", { ascending: true }),
      db.from("clients")
        .select("max_tags, max_keys, tier")
        .eq("id", user.client_id)
        .single()
    ]);

    const totalCalls = dailyUsage?.reduce((s, d) => s + d.request_count, 0) || 0;
    const totalErrors = dailyUsage?.reduce((s, d) => s + d.error_count, 0) || 0;

    // Calculate quota percentages
    const deviceQuotaPercent = client?.max_tags
      ? Math.round((devicesCount / client.max_tags) * 100)
      : 0;
    const keyQuotaPercent = client?.max_keys
      ? Math.round((keysCount / client.max_keys) * 100)
      : 0;

    json(res, {
      summary: {
        devices_bound: devicesCount,
        devices_limit: client?.max_tags,
        devices_quota_percent: deviceQuotaPercent,
        users_count: usersCount,
        api_keys_active: keysCount,
        api_keys_limit: client?.max_keys,
        api_keys_quota_percent: keyQuotaPercent,
        api_calls_period: totalCalls,
        api_errors_period: totalErrors,
        tier: client?.tier
      },
      daily_usage: dailyUsage || [],
      period
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/tenant/usage/export
 * Export usage data as CSV
 */
router.get("/export", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "data:export")) {
    return error(res, "Permission denied", 403, req);
  }

  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  try {
    const db = getUserScopedClient(req);
    const { data: dailyUsage } = await db
      .from("usage_daily")
      .select("date, request_count, error_count, avg_response_ms")
      .eq("client_id", user.client_id)
      .gte("date", since)
      .order("date", { ascending: true });

    // Generate CSV
    let csv = "Date,Requests,Errors,Avg Response (ms)\n";
    dailyUsage?.forEach(d => {
      csv += `${d.date},${d.request_count},${d.error_count},${d.avg_response_ms || 0}\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=usage_${period}.csv`);
    res.send(csv);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
