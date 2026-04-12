/**
 * Integration tests for api/admin/impersonate.js
 *
 * Mocked behaviour (documented here):
 *   - lib/supabase.js replaced with createMockSupabase() — no real DB.
 *   - lib/auth-middleware.js is fully replaced in require.cache:
 *       requireSuperAdmin() stubs return a fake admin directly (no DB lookup).
 *       logAudit() is a no-op. getClientIP() returns "127.0.0.1".
 *   - lib/auth.js JWT_SECRET is set via process.env before module load.
 *   - We extract the raw POST handler from the Express Router's internal stack
 *     (router.stack[0].route.stack[0].handle) and call it directly, bypassing
 *     Express 5's async routing layer which requires a fully-formed res object.
 *   - req/res are minimal stubs — res.status(n).json(b) is chainable.
 *
 * Tests:
 *   1. Valid impersonation mints a JWT containing impersonated_by.admin_id
 *   2. Minted token TTL == 900 seconds (exp - iat)
 *   3. Missing body params → 400
 *   4. Target user not active → 403
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { createMockSupabase } = require("./helpers/mock-supabase");

const IMPERSONATE_PATH = path.resolve(__dirname, "../api/admin/impersonate.js");
const SUPABASE_PATH    = path.resolve(__dirname, "../lib/supabase.js");
const AUTH_PATH        = path.resolve(__dirname, "../lib/auth.js");
const MIDDLEWARE_PATH  = path.resolve(__dirname, "../lib/auth-middleware.js");

const JWT_SECRET = "test-secret-at-least-32-chars-long!!";

const FAKE_ADMIN = { id: "admin-1", username: "superadmin@uttag.io", role: "superadmin" };

const ACTIVE_USER = {
  id: "user-1",
  email: "alice@tenant.io",
  name: "Alice",
  role: "operator",
  status: "active",
  client_id: "client-1",
  clients: { id: "client-1", name: "Tenant A", status: "active", industry: "cold_chain" },
};

const INACTIVE_USER = { ...ACTIVE_USER, id: "user-2", status: "inactive" };

function injectSupabase(mockSupa) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { supabase: mockSupa }, parent: null, children: [], paths: [],
  };
}

function injectMiddleware(adminOverride) {
  const admin = adminOverride !== undefined ? adminOverride : FAKE_ADMIN;
  require.cache[MIDDLEWARE_PATH] = {
    id: MIDDLEWARE_PATH, filename: MIDDLEWARE_PATH, loaded: true,
    exports: {
      requireSuperAdmin: async (_req, _res) => admin,
      requireTenantAuth:  async (_req, _res) => null,
      hasPermission:      () => false,
      requirePermission:  () => (_req, _res, next) => next(),
      logAudit:           async () => {},
      getClientIP:        () => "127.0.0.1",
    },
    parent: null, children: [], paths: [],
  };
}

/**
 * Load the impersonate router and extract the raw POST handler function.
 * We pull it out of router.stack[0].route.stack[0].handle so we can call
 * it directly as handler(req, res) without Express's async routing layer.
 */
function loadHandler() {
  delete require.cache[IMPERSONATE_PATH];
  delete require.cache[AUTH_PATH];
  process.env.JWT_SECRET = JWT_SECRET;
  delete process.env.IMPERSONATE_TTL; // use default 900
  const router = require(IMPERSONATE_PATH);
  // Walk the router stack to find the POST route handler
  const routeLayer = router.stack.find(l => l.route && l.route.methods && l.route.methods.post);
  assert.ok(routeLayer, "Could not find POST route in impersonate router");
  return routeLayer.route.stack[0].handle;
}

function makeReqRes(body = {}) {
  let _status = null;
  let _body = null;
  const res = {
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(s) { _status = s; return this; },
    json(b) { _body = b; return this; },
    end() {},
    get statusCode() { return _status; },
    get body() { return _body; },
  };
  const req = {
    method: "POST",
    url: "/",
    headers: { "user-agent": "test", origin: "https://test.example.com" },
    body,
  };
  return { req, res };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("impersonate — valid request", () => {
  test("minted token contains impersonated_by.admin_id", async () => {
    const mockSupa = createMockSupabase({
      tenant_users: [ACTIVE_USER],
      role_permissions: [],
      audit_logs: [],
    });
    injectSupabase(mockSupa);
    injectMiddleware();
    const handler = loadHandler();

    const { req, res } = makeReqRes({ tenant_user_id: "user-1" });
    await handler(req, res);

    assert.equal(res.statusCode, 200,
      `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body && res.body.token, "response should include a token");

    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    assert.ok(decoded.impersonated_by, "token should carry impersonated_by claim");
    assert.equal(decoded.impersonated_by.admin_id, FAKE_ADMIN.id);
  });

  test("minted token TTL is 900 seconds (exp - iat)", async () => {
    const mockSupa = createMockSupabase({
      tenant_users: [ACTIVE_USER],
      role_permissions: [],
      audit_logs: [],
    });
    injectSupabase(mockSupa);
    injectMiddleware();
    const handler = loadHandler();

    const { req, res } = makeReqRes({ tenant_user_id: "user-1" });
    await handler(req, res);

    assert.equal(res.statusCode, 200,
      `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    const ttl = decoded.exp - decoded.iat;
    assert.equal(ttl, 900, `Expected TTL 900s, got ${ttl}s`);
  });
});

describe("impersonate — missing params", () => {
  test("returns 400 when neither tenant_user_id nor (client_id + email) is provided", async () => {
    const mockSupa = createMockSupabase({ tenant_users: [], audit_logs: [] });
    injectSupabase(mockSupa);
    injectMiddleware();
    const handler = loadHandler();

    const { req, res } = makeReqRes({}); // empty body
    await handler(req, res);

    assert.equal(res.statusCode, 400);
  });
});

describe("impersonate — inactive target user", () => {
  test("returns 403 when target user status is not active", async () => {
    const mockSupa = createMockSupabase({
      tenant_users: [INACTIVE_USER],
      audit_logs: [],
    });
    injectSupabase(mockSupa);
    injectMiddleware();
    const handler = loadHandler();

    const { req, res } = makeReqRes({ tenant_user_id: "user-2" });
    await handler(req, res);

    assert.equal(res.statusCode, 403);
  });
});
