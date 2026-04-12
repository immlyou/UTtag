/**
 * Admin Analytics API
 * GET /api/admin/analytics/*
 * Phase 3: Multi-tenant Management
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireSuperAdmin } = require("../../lib/auth-middleware");

/**
 * GET /api/admin/analytics/overview
 * Platform-wide statistics
 */
router.get("/overview", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Parallel queries for efficiency
    const [
      { count: totalClients },
      { count: activeClients },
      { count: totalUsers },
      { count: totalDevices },
      { count: totalKeys },
      { data: apiUsage },
      { data: tierDist }
    ] = await Promise.all([
      supabase.from("clients").select("*", { count: "exact", head: true }).neq("status", "deleted"),
      supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("tenant_users").select("*", { count: "exact", head: true }),
      supabase.from("client_tags").select("*", { count: "exact", head: true }),
      supabase.from("api_keys").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("usage_daily").select("request_count").gte("date", since.split("T")[0]),
      supabase.from("clients").select("tier").neq("status", "deleted")
    ]);

    const totalApiCalls = apiUsage?.reduce((sum, r) => sum + r.request_count, 0) || 0;

    // Calculate tier distribution
    const tierDistribution = {};
    tierDist?.forEach(c => {
      tierDistribution[c.tier] = (tierDistribution[c.tier] || 0) + 1;
    });

    json(res, {
      summary: {
        total_clients: totalClients,
        active_clients: activeClients,
        total_users: totalUsers,
        total_devices: totalDevices,
        total_api_keys: totalKeys,
        api_calls_period: totalApiCalls
      },
      tier_distribution: tierDistribution,
      period
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/analytics/tenants
 * Per-tenant analytics with top tenants
 */
router.get("/tenants", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { period = "30d", limit = 10 } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  try {
    // Get usage by client
    const { data: usage } = await supabase
      .from("usage_daily")
      .select("client_id, request_count")
      .gte("date", since);

    // Aggregate by client
    const usageByClient = {};
    usage?.forEach(u => {
      if (u.client_id) {
        usageByClient[u.client_id] = (usageByClient[u.client_id] || 0) + u.request_count;
      }
    });

    // Get client details
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, company, tier, status")
      .neq("status", "deleted");

    // Combine and sort
    const tenantStats = clients?.map(c => ({
      ...c,
      api_calls: usageByClient[c.id] || 0
    })).sort((a, b) => b.api_calls - a.api_calls);

    json(res, {
      tenants: tenantStats?.slice(0, parseInt(limit)),
      total: tenantStats?.length || 0,
      period
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/analytics/growth
 * Tenant growth over time
 */
router.get("/growth", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { period = "90d" } = req.query;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Get clients created over time
    const { data: clients } = await supabase
      .from("clients")
      .select("created_at")
      .neq("status", "deleted")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    // Group by date
    const dailyGrowth = {};
    clients?.forEach(c => {
      const date = c.created_at.split("T")[0];
      dailyGrowth[date] = (dailyGrowth[date] || 0) + 1;
    });

    // Convert to array
    const growth = Object.entries(dailyGrowth)
      .map(([date, count]) => ({ date, new_clients: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    json(res, { growth, period }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/admin/audit-logs
 * Query audit logs
 */
router.get("/audit-logs", async (req, res) => {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { client_id, action, resource, limit = 100, offset = 0 } = req.query;

  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (client_id) query = query.eq("client_id", client_id);
    if (action) query = query.eq("action", action);
    if (resource) query = query.eq("resource", resource);

    const { data: logs, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message, 400, req);

    json(res, logs, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
