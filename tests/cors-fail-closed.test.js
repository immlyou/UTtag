/**
 * Unit tests for CORS logic in lib/auth.js
 *
 * lib/auth.js reads ALLOWED_ORIGINS and NODE_ENV at module load time (module-level const).
 * To test different env configurations we must:
 *   1. Set process.env before require()
 *   2. delete require.cache for both lib/auth.js AND lib/supabase.js (supabase is imported by auth)
 *   3. Restore process.env after each test
 *
 * Mocked behaviour:
 *   - lib/supabase.js is mocked by overriding the require cache so no real Supabase client is created.
 *   - Response object is a minimal stub that records calls to setHeader().
 *   - JWT_SECRET must be set to satisfy the guard in lib/auth.js.
 */

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const AUTH_PATH    = path.resolve(__dirname, "../lib/auth.js");
const SUPABASE_PATH = path.resolve(__dirname, "../lib/supabase.js");

// Inject a stub supabase into the require cache so lib/auth.js never touches real DB
function stubSupabase() {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { supabase: {} },
    // minimal Module fields
    parent: null, children: [], paths: [],
  };
}

function freshCors(env = {}) {
  // Save original env
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  // Apply new env
  process.env.JWT_SECRET = env.JWT_SECRET ?? "test-secret-at-least-32-chars-long!!";
  if (env.NODE_ENV !== undefined) process.env.NODE_ENV = env.NODE_ENV;
  else delete process.env.NODE_ENV;
  if (env.ALLOWED_ORIGINS !== undefined) process.env.ALLOWED_ORIGINS = env.ALLOWED_ORIGINS;
  else delete process.env.ALLOWED_ORIGINS;

  // Bust caches
  delete require.cache[AUTH_PATH];
  stubSupabase();

  const { cors } = require(AUTH_PATH);

  // Restore env
  if (saved.JWT_SECRET !== undefined) process.env.JWT_SECRET = saved.JWT_SECRET;
  else delete process.env.JWT_SECRET;
  if (saved.NODE_ENV !== undefined) process.env.NODE_ENV = saved.NODE_ENV;
  else delete process.env.NODE_ENV;
  if (saved.ALLOWED_ORIGINS !== undefined) process.env.ALLOWED_ORIGINS = saved.ALLOWED_ORIGINS;
  else delete process.env.ALLOWED_ORIGINS;

  return cors;
}

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader(k, v) { headers[k] = v; },
    status() { return this; },
    json() {},
  };
}

function makeReq(origin) {
  return { headers: origin ? { origin } : {} };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CORS — production, no ALLOWED_ORIGINS", () => {
  test("does not set Access-Control-Allow-Origin header", () => {
    const cors = freshCors({ NODE_ENV: "production" });
    const res = makeRes();
    cors(res, makeReq("https://attacker.com"));
    assert.ok(!("Access-Control-Allow-Origin" in res.headers),
      "ACAO should not be set when ALLOWED_ORIGINS is absent in production");
  });
});

describe("CORS — production, ALLOWED_ORIGINS set", () => {
  test("sets ACAO when request origin matches allowed list", () => {
    const cors = freshCors({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://a.com" });
    const res = makeRes();
    cors(res, makeReq("https://a.com"));
    assert.equal(res.headers["Access-Control-Allow-Origin"], "https://a.com");
  });

  test("does NOT set ACAO when request origin is not in allowed list", () => {
    const cors = freshCors({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://a.com" });
    const res = makeRes();
    cors(res, makeReq("https://evil.com"));
    assert.ok(!("Access-Control-Allow-Origin" in res.headers),
      "ACAO should not be set for non-allowed origins");
  });
});

describe("CORS — development environment", () => {
  test("sets wildcard Access-Control-Allow-Origin in dev", () => {
    const cors = freshCors({ NODE_ENV: "development" });
    const res = makeRes();
    cors(res, makeReq("https://localhost:3000"));
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  });
});
