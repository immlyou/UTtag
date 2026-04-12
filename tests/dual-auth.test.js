/**
 * Unit tests for dualAuth() in lib/auth-middleware.js
 *
 * Mocked behaviour:
 *   - lib/supabase.js replaced with createMockSupabase() — no real DB.
 *   - lib/auth.js loaded fresh per describe block so JWT_SECRET is applied.
 *   - lib/auth-middleware.js loaded fresh per test so require.cache is clean.
 *   - req/res are minimal stubs (res.status(n).json(b) chainable).
 *
 * Tests:
 *   1. Admin token  → kind='admin', scopeClientId=null
 *   2. Tenant token → kind='tenant', scopeClientId=<uuid>
 *   3. Bad token    → null + 401
 *   4. No token     → null + 401
 *   5. Tenant with status !== 'active' → null + 403
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { createMockSupabase } = require("./helpers/mock-supabase");

const SUPABASE_PATH    = path.resolve(__dirname, "../lib/supabase.js");
const AUTH_PATH        = path.resolve(__dirname, "../lib/auth.js");
const MIDDLEWARE_PATH  = path.resolve(__dirname, "../lib/auth-middleware.js");

const JWT_SECRET = "test-secret-at-least-32-chars-long!!";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_ADMIN = { id: "admin-1", username: "superadmin@uttag.io", role: "superadmin" };
const FAKE_ADMIN_PLAIN = { id: "admin-2", username: "admin@uttag.io", role: "admin" };

const ACTIVE_CLIENT = { id: "client-1", status: "active", industry: "cold_chain" };
const SUSPENDED_CLIENT = { id: "client-2", status: "suspended", industry: "generic" };

const ACTIVE_USER = {
  id: "user-1",
  email: "alice@tenant.io",
  name: "Alice",
  role: "operator",
  status: "active",
  client_id: "client-1",
  clients: ACTIVE_CLIENT,
};

const INACTIVE_USER = {
  ...ACTIVE_USER,
  id: "user-2",
  status: "inactive",
};

const SUSPENDED_ORG_USER = {
  ...ACTIVE_USER,
  id: "user-3",
  client_id: "client-2",
  clients: SUSPENDED_CLIENT,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function injectSupabase(mockSupa) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { supabase: mockSupa }, parent: null, children: [], paths: [],
  };
}

function loadDualAuth() {
  delete require.cache[MIDDLEWARE_PATH];
  delete require.cache[AUTH_PATH];
  process.env.JWT_SECRET = JWT_SECRET;
  return require(MIDDLEWARE_PATH).dualAuth;
}

function makeReqRes({ token } = {}) {
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
    method: "GET",
    url: "/",
    headers: {
      "user-agent": "test",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
  return { req, res };
}

function mintAdminToken(payload = {}) {
  return jwt.sign({ id: "admin-1", ...payload }, JWT_SECRET, { expiresIn: "1h" });
}

function mintTenantToken(payload = {}) {
  return jwt.sign({ id: "user-1", type: "tenant_user", ...payload }, JWT_SECRET, { expiresIn: "1h" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("dualAuth — admin token", () => {
  test("returns kind='admin' with scopeClientId=null", async () => {
    const mockSupa = createMockSupabase({
      admins: [FAKE_ADMIN],
      tenant_users: [],
    });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const token = mintAdminToken({ id: "admin-1" });
    const { req, res } = makeReqRes({ token });

    const result = await dualAuth(req, res);

    assert.ok(result, `Expected non-null result, got ${JSON.stringify(res.body)}`);
    assert.equal(result.kind, "admin");
    assert.equal(result.scopeClientId, null);
    assert.equal(result.admin.id, "admin-1");
    assert.equal(result.admin.role, "superadmin");
  });

  test("plain admin role (not superadmin) also returns kind='admin'", async () => {
    const mockSupa = createMockSupabase({
      admins: [FAKE_ADMIN_PLAIN],
      tenant_users: [],
    });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const token = mintAdminToken({ id: "admin-2" });
    const { req, res } = makeReqRes({ token });

    const result = await dualAuth(req, res);

    assert.ok(result, `Expected non-null result, got ${JSON.stringify(res.body)}`);
    assert.equal(result.kind, "admin");
    assert.equal(result.scopeClientId, null);
    assert.equal(result.admin.role, "admin");
  });
});

describe("dualAuth — tenant token", () => {
  test("returns kind='tenant' with correct scopeClientId", async () => {
    const mockSupa = createMockSupabase({
      admins: [],
      tenant_users: [ACTIVE_USER],
    });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const token = mintTenantToken({ id: "user-1" });
    const { req, res } = makeReqRes({ token });

    const result = await dualAuth(req, res);

    assert.ok(result, `Expected non-null result, got ${JSON.stringify(res.body)}`);
    assert.equal(result.kind, "tenant");
    assert.equal(result.scopeClientId, "client-1");
    assert.equal(result.user.client_id, "client-1");
    assert.equal(result.user.email, "alice@tenant.io");
  });
});

describe("dualAuth — bad / missing token", () => {
  test("bad token returns null and sends 401", async () => {
    const mockSupa = createMockSupabase({ admins: [], tenant_users: [] });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const { req, res } = makeReqRes({ token: "this.is.not.valid" });

    const result = await dualAuth(req, res);

    assert.equal(result, null);
    assert.equal(res.statusCode, 401);
  });

  test("missing Authorization header returns null and sends 401", async () => {
    const mockSupa = createMockSupabase({ admins: [], tenant_users: [] });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const { req, res } = makeReqRes({}); // no token

    const result = await dualAuth(req, res);

    assert.equal(result, null);
    assert.equal(res.statusCode, 401);
  });
});

describe("dualAuth — inactive tenant user", () => {
  test("tenant user with status !== 'active' returns null and sends 403", async () => {
    const mockSupa = createMockSupabase({
      admins: [],
      tenant_users: [INACTIVE_USER],
    });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    // Token for user-2 (inactive)
    const token = jwt.sign({ id: "user-2", type: "tenant_user" }, JWT_SECRET, { expiresIn: "1h" });
    const { req, res } = makeReqRes({ token });

    const result = await dualAuth(req, res);

    assert.equal(result, null);
    assert.equal(res.statusCode, 403);
  });

  test("tenant user whose org is suspended returns null and sends 403", async () => {
    const mockSupa = createMockSupabase({
      admins: [],
      tenant_users: [SUSPENDED_ORG_USER],
    });
    injectSupabase(mockSupa);
    const dualAuth = loadDualAuth();

    const token = jwt.sign({ id: "user-3", type: "tenant_user" }, JWT_SECRET, { expiresIn: "1h" });
    const { req, res } = makeReqRes({ token });

    const result = await dualAuth(req, res);

    assert.equal(result, null);
    assert.equal(res.statusCode, 403);
  });
});
