/**
 * Tenant Alerts API
 * GET /api/tenant/alerts
 * Phase 5: derived alerts from recent sensor data + thresholds.
 *
 * There is no dedicated `alerts` table; we compute threshold violations on
 * the fly using sensor_bindings (per-tag overrides) with industry_defaults
 * as the fallback. Cheap enough for the tenant dashboard.
 */

const express = require("express");
const router = express.Router();
const { supabase, getUserScopedClient } = require("../../lib/supabase");
const { json, error } = require("../../lib/auth");
const { requireTenantAuth } = require("../../lib/auth-middleware");

const WINDOW_MS = 24 * 60 * 60 * 1000;     // look back 24h
const MAX_READINGS = 500;                   // cap work per request
const MAX_ALERTS = 100;

router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  try {
    const db = getUserScopedClient(req);
    // 1. My tags
    const { data: tags, error: tagErr } = await db
      .from("client_tags")
      .select("mac, label")
      .eq("client_id", user.client_id);
    if (tagErr) return error(res, tagErr.message, 400, req);

    if (!tags || tags.length === 0) {
      return json(res, { alerts: [], total: 0, window_hours: 24 }, 200, req);
    }

    const macs = tags.map(t => t.mac);
    const labelByMac = Object.fromEntries(tags.map(t => [t.mac, t.label || t.mac]));

    // 2. Per-tag bindings + industry defaults (parallel)
    const [bindingsRes, defaultsRes, readingsRes] = await Promise.all([
      db
        .from("sensor_bindings")
        .select("mac, sensor_type, min_threshold, max_threshold, enabled")
        .in("mac", macs)
        .eq("enabled", true),
      db
        .from("industry_defaults")
        .select("temp_min, temp_max, humidity_min, humidity_max")
        .eq("industry", user.industry || "generic")
        .single(),
      db
        .from("sensor_data")
        .select("mac, temperature, humidity, created_at")
        .in("mac", macs)
        .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_READINGS),
    ]);

    const bindings = bindingsRes.data || [];
    const defaults = defaultsRes.data || {};
    const readings = readingsRes.data || [];

    // Index bindings by mac+type for O(1) lookup
    const bindingKey = (mac, type) => mac + "::" + type;
    const bindingIndex = {};
    for (const b of bindings) {
      // sensor_type can be "temperature", "humidity", or "all"
      if (b.sensor_type === "all") {
        bindingIndex[bindingKey(b.mac, "temperature")] = b;
        bindingIndex[bindingKey(b.mac, "humidity")]    = b;
      } else {
        bindingIndex[bindingKey(b.mac, b.sensor_type)] = b;
      }
    }

    // 3. Derive violations
    const alerts = [];
    for (const r of readings) {
      // Temperature
      if (r.temperature != null) {
        const b = bindingIndex[bindingKey(r.mac, "temperature")];
        const tMin = b?.min_threshold ?? defaults.temp_min;
        const tMax = b?.max_threshold ?? defaults.temp_max;
        if (tMin != null && r.temperature < tMin) {
          alerts.push({
            at: r.created_at, mac: r.mac, label: labelByMac[r.mac],
            kind: "temp_low",  metric: "temperature",
            value: r.temperature, threshold: tMin, severity: "warn",
          });
        } else if (tMax != null && r.temperature > tMax) {
          alerts.push({
            at: r.created_at, mac: r.mac, label: labelByMac[r.mac],
            kind: "temp_high", metric: "temperature",
            value: r.temperature, threshold: tMax, severity: "warn",
          });
        }
      }
      // Humidity
      if (r.humidity != null) {
        const b = bindingIndex[bindingKey(r.mac, "humidity")];
        const hMin = b?.min_threshold ?? defaults.humidity_min;
        const hMax = b?.max_threshold ?? defaults.humidity_max;
        if (hMin != null && r.humidity < hMin) {
          alerts.push({
            at: r.created_at, mac: r.mac, label: labelByMac[r.mac],
            kind: "humidity_low",  metric: "humidity",
            value: r.humidity, threshold: hMin, severity: "info",
          });
        } else if (hMax != null && r.humidity > hMax) {
          alerts.push({
            at: r.created_at, mac: r.mac, label: labelByMac[r.mac],
            kind: "humidity_high", metric: "humidity",
            value: r.humidity, threshold: hMax, severity: "info",
          });
        }
      }
    }

    alerts.sort((a, b) => new Date(b.at) - new Date(a.at));

    json(res, {
      alerts: alerts.slice(0, MAX_ALERTS),
      total: alerts.length,
      window_hours: Math.round(WINDOW_MS / 3600000),
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
