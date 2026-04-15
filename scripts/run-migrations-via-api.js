#!/usr/bin/env node
/**
 * Run SQL migrations against Supabase via Management API.
 * Usage: SUPABASE_ACCESS_TOKEN=<token> node scripts/run-migrations-via-api.js
 *
 * The token is the dashboard access token (from browser localStorage).
 * This script is a one-shot tool; delete after use.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REF = "nhoebbmynhrfhnszzexl";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Set SUPABASE_ACCESS_TOKEN env var (from Supabase dashboard localStorage)");
  process.exit(1);
}

const MIGRATIONS = [
  "supabase-schema.sql",
  "supabase-migration-phase5-industry.sql",
  "supabase-migration-phase5b-rls.sql",
  "supabase-migration-phase5c-tenant-alerts.sql",
  "supabase-migration-phase5d-scheduler-lock.sql",
  "supabase-migration-phase5e-password-reset.sql",
];

async function runSQL(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (res.status >= 400) {
    throw new Error(`${label}: HTTP ${res.status} — ${body.message || JSON.stringify(body)}`);
  }
  return body;
}

(async () => {
  for (const file of MIGRATIONS) {
    const filePath = path.join(__dirname, "..", file);
    const sql = fs.readFileSync(filePath, "utf8");
    process.stdout.write(`→ ${file} (${sql.length} chars)... `);
    try {
      await runSQL(sql, file);
      console.log("OK");
    } catch (e) {
      console.log("FAIL:", e.message);
      // Don't stop — some migrations use IF NOT EXISTS and may partially succeed
    }
  }
  console.log("\nAll migrations done.");
})();
