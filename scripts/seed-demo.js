#!/usr/bin/env node
/**
 * One-shot demo seed.
 *
 *   node scripts/seed-demo.js            # create / refresh demo tenants
 *   node scripts/seed-demo.js --wipe     # also delete old demo rows first
 *
 * Idempotent. Runs against the current SUPABASE_URL + SUPABASE_SERVICE_KEY
 * (same credentials the server uses). Intended for demo machines; never
 * point this at a real customer database.
 *
 * Mirrors supabase-seed-tenant-demo.sql but as code so it can run from
 * CI / a preflight script without psql or the Supabase SQL editor.
 */

"use strict";

require("dotenv").config({ path: ".env.local" });

const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL + SUPABASE_SERVICE_KEY must be set. See .env.example.");
  process.exit(1);
}

const wipe = process.argv.includes("--wipe");
const DEMO_PASSWORD = "demopass";

const TENANTS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "冷鏈 Demo 客戶",
    email: "coldchain-demo@uttag.local",
    company: "ColdChain Demo Co.",
    tier: "pro",
    industry: "cold_chain",
    users: [
      { email: "admin@coldchain.demo",    name: "冷鏈管理員", role: "admin" },
      { email: "operator@coldchain.demo", name: "冷鏈操作員", role: "operator" },
      { email: "viewer@coldchain.demo",   name: "冷鏈檢視者", role: "user" },
    ],
    tags: [
      { mac: "CC:00:00:00:00:01", label: "冷凍車 A" },
      { mac: "CC:00:00:00:00:02", label: "冷凍車 B" },
      { mac: "CC:00:00:00:00:03", label: "冷凍倉 1" },
    ],
    readings: [
      // Deliberately include one above and one below threshold so alerts light up.
      { mac: "CC:00:00:00:00:01", temperature:  4.1, humidity: 68, minutes_ago:  2 },
      { mac: "CC:00:00:00:00:02", temperature: 12.3, humidity: 70, minutes_ago:  3 }, // too warm
      { mac: "CC:00:00:00:00:03", temperature: -18.5, humidity: 55, minutes_ago: 12 }, // freezer OK
    ],
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "生醫 Demo 客戶",
    email: "biomed-demo@uttag.local",
    company: "BioMed Demo Co.",
    tier: "pro",
    industry: "biomedical",
    users: [
      { email: "admin@biomed.demo",    name: "生醫管理員", role: "admin" },
      { email: "operator@biomed.demo", name: "生醫操作員", role: "operator" },
      { email: "viewer@biomed.demo",   name: "生醫檢視者", role: "user" },
    ],
    tags: [
      { mac: "BM:00:00:00:00:01", label: "疫苗冰箱 A" },
      { mac: "BM:00:00:00:00:02", label: "疫苗冰箱 B" },
      { mac: "BM:00:00:00:00:03", label: "運輸箱 #7" },
    ],
    readings: [
      { mac: "BM:00:00:00:00:01", temperature: 5.0, humidity: 40, minutes_ago:  1 },
      { mac: "BM:00:00:00:00:02", temperature: 4.7, humidity: 42, minutes_ago:  4 },
      { mac: "BM:00:00:00:00:03", temperature: 9.2, humidity: 38, minutes_ago: 45 }, // too warm
    ],
  },
];

(async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (wipe) {
    console.log("Wiping previous demo rows...");
    const ids = TENANTS.map(t => t.id);
    // Cascade deletes remove tenant_users, client_tags, etc.
    const { error } = await supabase.from("clients").delete().in("id", ids);
    if (error) console.warn("wipe warning:", error.message);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const t of TENANTS) {
    process.stdout.write("→ " + t.name + " ");

    // Upsert the client row.
    const { error: cErr } = await supabase.from("clients").upsert({
      id: t.id, name: t.name, email: t.email, company: t.company,
      tier: t.tier, industry: t.industry, max_tags: 50, max_keys: 5,
    }, { onConflict: "email" });
    if (cErr) { console.log("FAIL client:", cErr.message); continue; }

    // Users.
    for (const u of t.users) {
      const { error: uErr } = await supabase.from("tenant_users").upsert({
        client_id: t.id, email: u.email, name: u.name,
        password_hash: hash, role: u.role, status: "active",
      }, { onConflict: "client_id,email" });
      if (uErr) console.log("\n  user fail:", u.email, uErr.message);
    }

    // Tags.
    for (const tag of t.tags) {
      const { error: tErr } = await supabase.from("client_tags").upsert({
        client_id: t.id, mac: tag.mac, label: tag.label,
      }, { onConflict: "client_id,mac" });
      if (tErr) console.log("\n  tag fail:", tag.mac, tErr.message);
    }

    // Sensor readings (no conflict handling — fresh inserts each run).
    for (const r of t.readings) {
      const at = new Date(Date.now() - r.minutes_ago * 60_000).toISOString();
      await supabase.from("sensor_data").insert({
        mac: r.mac, temperature: r.temperature, humidity: r.humidity,
        source: "seed", created_at: at,
      });
    }
    console.log("OK");
  }

  console.log("\nDone. Login accounts (password = \"" + DEMO_PASSWORD + "\"):");
  TENANTS.forEach(t => {
    console.log("  " + t.name + " / " + t.industry);
    t.users.forEach(u => console.log("    - " + u.email + "  (" + u.role + ")"));
  });
  console.log("\nTry: open http://localhost:3030/tenant-login.html");
})();
