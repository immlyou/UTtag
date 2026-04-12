/**
 * Unit tests for alert derivation logic extracted from api/tenant/alerts.js
 *
 * We extract the pure derivation logic inline here — no HTTP, no DB.
 * The alert derivation in the handler is a pure computation over:
 *   - bindings (per-tag overrides)
 *   - defaults (industry thresholds)
 *   - readings (sensor_data rows)
 *
 * Mocked behaviour:
 *   - No Supabase calls. We replicate the derivation loop locally.
 *   - We test the algorithm, not the HTTP handler wiring.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// Replicate the derivation logic from api/tenant/alerts.js so we can unit-test it
// without spinning up Express or mocking Supabase at the handler level.
function deriveAlerts({ bindings, defaults, readings, labelByMac }) {
  const bindingKey = (mac, type) => mac + "::" + type;
  const bindingIndex = {};
  for (const b of bindings) {
    if (b.sensor_type === "all") {
      bindingIndex[bindingKey(b.mac, "temperature")] = b;
      bindingIndex[bindingKey(b.mac, "humidity")]    = b;
    } else {
      bindingIndex[bindingKey(b.mac, b.sensor_type)] = b;
    }
  }

  const alerts = [];
  for (const r of readings) {
    if (r.temperature != null) {
      const b = bindingIndex[bindingKey(r.mac, "temperature")];
      const tMin = b?.min_threshold ?? defaults.temp_min;
      const tMax = b?.max_threshold ?? defaults.temp_max;
      if (tMin != null && r.temperature < tMin) {
        alerts.push({ kind: "temp_low", mac: r.mac, value: r.temperature, threshold: tMin, label: labelByMac[r.mac] });
      } else if (tMax != null && r.temperature > tMax) {
        alerts.push({ kind: "temp_high", mac: r.mac, value: r.temperature, threshold: tMax, label: labelByMac[r.mac] });
      }
    }
    if (r.humidity != null) {
      const b = bindingIndex[bindingKey(r.mac, "humidity")];
      const hMin = b?.min_threshold ?? defaults.humidity_min;
      const hMax = b?.max_threshold ?? defaults.humidity_max;
      if (hMin != null && r.humidity < hMin) {
        alerts.push({ kind: "humidity_low", mac: r.mac, value: r.humidity, threshold: hMin, label: labelByMac[r.mac] });
      } else if (hMax != null && r.humidity > hMax) {
        alerts.push({ kind: "humidity_high", mac: r.mac, value: r.humidity, threshold: hMax, label: labelByMac[r.mac] });
      }
    }
  }
  return alerts;
}

const COLD_CHAIN_DEFAULTS = { temp_min: 2, temp_max: 8, humidity_min: 30, humidity_max: 85 };
const MAC = "AA:BB:CC:DD:EE:FF";
const labelByMac = { [MAC]: "冷藏車A" };

describe("alert derivation — temperature", () => {
  test("temperature above temp_max produces temp_high alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: 9.5, humidity: null, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "temp_high");
    assert.equal(alerts[0].threshold, 8);
    assert.equal(alerts[0].value, 9.5);
  });

  test("temperature below temp_min produces temp_low alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: 0.5, humidity: null, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "temp_low");
    assert.equal(alerts[0].threshold, 2);
  });

  test("temperature exactly at temp_max boundary does NOT produce an alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: 8, humidity: null, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 0);
  });

  test("temperature exactly at temp_min boundary does NOT produce an alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: 2, humidity: null, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 0);
  });
});

describe("alert derivation — humidity", () => {
  test("humidity above humidity_max produces humidity_high alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: null, humidity: 90, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "humidity_high");
    assert.equal(alerts[0].threshold, 85);
  });

  test("humidity exactly at humidity_max boundary does NOT produce an alert", () => {
    const alerts = deriveAlerts({
      bindings: [],
      defaults: COLD_CHAIN_DEFAULTS,
      readings: [{ mac: MAC, temperature: null, humidity: 85, created_at: new Date().toISOString() }],
      labelByMac,
    });
    assert.equal(alerts.length, 0);
  });
});

describe("alert derivation — multiple readings and kinds", () => {
  test("correct total alert count when multiple readings violate thresholds", () => {
    const readings = [
      { mac: MAC, temperature: 10, humidity: 90, created_at: new Date().toISOString() }, // temp_high + humidity_high
      { mac: MAC, temperature: 1,  humidity: 20, created_at: new Date().toISOString() }, // temp_low + humidity_low
      { mac: MAC, temperature: 5,  humidity: 50, created_at: new Date().toISOString() }, // within bounds — no alert
    ];
    const alerts = deriveAlerts({ bindings: [], defaults: COLD_CHAIN_DEFAULTS, readings, labelByMac });
    assert.equal(alerts.length, 4);
    const kinds = alerts.map(a => a.kind).sort();
    assert.deepEqual(kinds, ["humidity_high", "humidity_low", "temp_high", "temp_low"]);
  });
});
