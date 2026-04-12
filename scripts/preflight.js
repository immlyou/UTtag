#!/usr/bin/env node
/**
 * Pre-flight check. Run before `node server.js` on a new machine
 * (especially demo boxes) so we catch missing env + DB wiring BEFORE
 * a client is looking at the screen.
 *
 *   node scripts/preflight.js
 *
 * Exits 0 on success, 1 on any failure.
 */

"use strict";

require("dotenv").config({ path: ".env.local" });

const REQUIRED = [
  ["SUPABASE_URL",         /^https?:\/\//],
  ["SUPABASE_SERVICE_KEY", /.{20,}/],
  ["JWT_SECRET",           /.{32,}/],
];

const RECOMMENDED = [
  ["ALLOWED_ORIGINS", "unset — production will block all cross-origin requests"],
  ["APP_URL",         "unset — invite/reset emails will use http://localhost:3030"],
  ["RESEND_API_KEY",  "unset — report emails + invite/reset emails will not be delivered"],
  ["EMAIL_FROM",      "unset — Resend calls will reject without a from address"],
];

const OPTIONAL = [
  ["IMPERSONATE_TTL", "default 900s (15 min) for admin impersonation tokens"],
  ["ENABLE_SCHEDULER", "default true — set false to disable report scheduler on this instance"],
  ["ENABLE_PUSH",      "default true — set false to disable Firebase push init"],
];

let failed = 0;

function line(tag, msg) {
  console.log("  " + tag + " " + msg);
}

console.log("\nRequired environment:");
for (const [k, re] of REQUIRED) {
  const v = process.env[k];
  if (!v) { line("✗", k + " is MISSING"); failed++; continue; }
  if (re && !re.test(v)) { line("✗", k + " present but fails validator " + re); failed++; continue; }
  line("✓", k);
}

console.log("\nRecommended environment:");
for (const [k, note] of RECOMMENDED) {
  if (process.env[k]) line("✓", k);
  else line("!", k + " — " + note);
}

console.log("\nOptional environment:");
for (const [k, note] of OPTIONAL) {
  if (process.env[k]) line("✓", k + " = " + process.env[k]);
  else line("·", k + " — " + note);
}

// Supabase smoke: can we SELECT from clients?
(async () => {
  if (failed > 0) {
    console.log("\nRequired env missing — skipping DB smoke test.");
    process.exit(1);
  }
  console.log("\nDatabase smoke test:");
  let supabase;
  try {
    supabase = require("@supabase/supabase-js").createClient(
      process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY
    );
  } catch (err) {
    line("✗", "@supabase/supabase-js failed to load: " + err.message);
    process.exit(1);
  }

  const checks = [
    ["clients",            "id, name, industry"],
    ["tenant_users",       "id, email, role, status"],
    ["client_tags",        "id, mac"],
    ["industry_defaults",  "industry, display_name, features"],
    ["tenant_settings",    "client_id, primary_color"],
    ["tenant_alerts",      "id, mac, kind"],
  ];
  let dbFailed = 0;
  for (const [table, cols] of checks) {
    const { error } = await supabase.from(table).select(cols).limit(1);
    if (error) {
      line("✗", table + " — " + error.message);
      dbFailed++;
    } else {
      line("✓", table);
    }
  }

  // Seed health: do we have the demo tenants?
  const { data: demoRows } = await supabase
    .from("clients")
    .select("id, name, industry, email")
    .like("email", "%@uttag.local");

  if (!demoRows || demoRows.length < 2) {
    console.log("\nDemo seed:");
    line("!", "demo tenants not found — run `node scripts/seed-demo.js`");
  } else {
    console.log("\nDemo seed:");
    demoRows.forEach(r => line("✓", r.name + " (" + r.industry + ")"));
  }

  if (failed + dbFailed > 0) {
    console.log("\nPreflight FAILED — fix the items above before demo.");
    process.exit(1);
  }
  console.log("\nPreflight OK — server is ready to start.");
  process.exit(0);
})();
