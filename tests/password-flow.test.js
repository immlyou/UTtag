/**
 * Integration tests for api/tenant/password-flow.js
 *
 * Mocked behaviour:
 *   - lib/supabase.js replaced with createMockSupabase() — no real DB.
 *   - lib/auth-middleware.js stubbed: logAudit() is a no-op, getClientIP() returns "127.0.0.1".
 *   - lib/email.js stubbed: sendPasswordResetEmail() is a no-op.
 *   - We extract route handlers directly from the Express Router stack.
 *
 * Tests:
 *   1. POST /forgot with non-existent email → 200 (anti-enumeration)
 *   2. POST /forgot with existing email → 200 + reset_token written to DB
 *   3. POST /reset with valid token → 200 + password updated, token cleared
 *   4. POST /reset with expired token → 400
 *   5. POST /reset with non-existent token → 400
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createMockSupabase } = require("./helpers/mock-supabase");

const HANDLER_PATH    = path.resolve(__dirname, "../api/tenant/password-flow.js");
const SUPABASE_PATH   = path.resolve(__dirname, "../lib/supabase.js");
const AUTH_PATH       = path.resolve(__dirname, "../lib/auth.js");
const MIDDLEWARE_PATH = path.resolve(__dirname, "../lib/auth-middleware.js");
const EMAIL_PATH      = path.resolve(__dirname, "../lib/email.js");

const JWT_SECRET = "test-secret-at-least-32-chars-long!!";

const NOW = new Date().toISOString();
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
const PAST   = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

const ACTIVE_USER = {
  id: "user-1",
  email: "alice@tenant.io",
  status: "active",
  client_id: "client-1",
  last_login_at: NOW,
  reset_token: null,
  reset_expires_at: null,
  password_hash: "$2a$10$placeholder",
};

function injectSupabase(mockSupa) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { supabase: mockSupa }, parent: null, children: [], paths: [],
  };
}

function injectMiddleware() {
  require.cache[MIDDLEWARE_PATH] = {
    id: MIDDLEWARE_PATH, filename: MIDDLEWARE_PATH, loaded: true,
    exports: {
      requireSuperAdmin: async () => null,
      requireTenantAuth: async () => null,
      hasPermission: () => false,
      requirePermission: () => (_req, _res, next) => next(),
      logAudit: async () => {},
      getClientIP: () => "127.0.0.1",
    },
    parent: null, children: [], paths: [],
  };
}

function injectEmail() {
  require.cache[EMAIL_PATH] = {
    id: EMAIL_PATH, filename: EMAIL_PATH, loaded: true,
    exports: {
      sendPasswordResetEmail: async () => {},
    },
    parent: null, children: [], paths: [],
  };
}

/**
 * Load the password-flow router and find a named route handler.
 * Returns the async handler function for the given method + path fragment.
 */
function loadRouter() {
  delete require.cache[HANDLER_PATH];
  delete require.cache[AUTH_PATH];
  process.env.JWT_SECRET = JWT_SECRET;
  injectMiddleware();
  injectEmail();
  return require(HANDLER_PATH);
}

function findHandler(router, method, routePath) {
  const layer = router.stack.find(
    l => l.route &&
         l.route.path === routePath &&
         l.route.methods[method.toLowerCase()]
  );
  assert.ok(layer, `Could not find ${method} ${routePath} in router`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReqRes(method, body = {}) {
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
    method,
    url: "/",
    headers: { "user-agent": "test", origin: "https://test.example.com" },
    body,
  };
  return { req, res };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /forgot — non-existent email", () => {
  test("returns 200 even when email not in DB (anti-enumeration)", async () => {
    const mockSupa = createMockSupabase({ tenant_users: [] });
    injectSupabase(mockSupa);
    const router = loadRouter();
    const handler = findHandler(router, "POST", "/forgot");

    const { req, res } = makeReqRes("POST", { email: "nobody@example.com" });
    await handler(req, res);

    assert.equal(res.statusCode, 200,
      `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success, "response.success should be true");
  });
});

describe("POST /forgot — existing email", () => {
  test("returns 200 and writes reset_token to DB", async () => {
    const mockSupa = createMockSupabase({ tenant_users: [{ ...ACTIVE_USER }] });
    injectSupabase(mockSupa);
    const router = loadRouter();
    const handler = findHandler(router, "POST", "/forgot");

    const { req, res } = makeReqRes("POST", { email: "alice@tenant.io" });
    await handler(req, res);

    assert.equal(res.statusCode, 200,
      `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success, "response.success should be true");

    // Verify reset_token was written via update()
    const updateCall = mockSupa._calls.update.find(c => c.table === "tenant_users");
    assert.ok(updateCall, "Expected an update() call on tenant_users");
    assert.ok(updateCall.patch.reset_token, "reset_token should be set in the update patch");
    assert.ok(updateCall.patch.reset_expires_at, "reset_expires_at should be set in the update patch");
  });
});

describe("POST /reset — valid token", () => {
  test("returns 200 and clears reset token", async () => {
    const userWithToken = {
      ...ACTIVE_USER,
      reset_token: "valid-reset-token-abc123",
      reset_expires_at: FUTURE,
    };
    const mockSupa = createMockSupabase({ tenant_users: [userWithToken] });
    injectSupabase(mockSupa);
    const router = loadRouter();
    const handler = findHandler(router, "POST", "/reset");

    const { req, res } = makeReqRes("POST", {
      token: "valid-reset-token-abc123",
      new_password: "newpassword123",
    });
    await handler(req, res);

    assert.equal(res.statusCode, 200,
      `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.success, "response.success should be true");

    // Verify the update cleared the token
    const updateCall = mockSupa._calls.update.find(c => c.table === "tenant_users");
    assert.ok(updateCall, "Expected an update() call on tenant_users");
    assert.equal(updateCall.patch.reset_token, null, "reset_token should be cleared to null");
    assert.equal(updateCall.patch.reset_expires_at, null, "reset_expires_at should be cleared to null");
  });
});

describe("POST /reset — expired token", () => {
  test("returns 400 for expired token", async () => {
    const userWithExpiredToken = {
      ...ACTIVE_USER,
      reset_token: "expired-token-xyz",
      reset_expires_at: PAST,
    };
    const mockSupa = createMockSupabase({ tenant_users: [userWithExpiredToken] });
    injectSupabase(mockSupa);
    const router = loadRouter();
    const handler = findHandler(router, "POST", "/reset");

    const { req, res } = makeReqRes("POST", {
      token: "expired-token-xyz",
      new_password: "newpassword123",
    });
    await handler(req, res);

    assert.equal(res.statusCode, 400,
      `Expected 400, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });
});

describe("POST /reset — non-existent token", () => {
  test("returns 400 for token not in DB", async () => {
    const mockSupa = createMockSupabase({ tenant_users: [] });
    injectSupabase(mockSupa);
    const router = loadRouter();
    const handler = findHandler(router, "POST", "/reset");

    const { req, res } = makeReqRes("POST", {
      token: "does-not-exist-token",
      new_password: "newpassword123",
    });
    await handler(req, res);

    assert.equal(res.statusCode, 400,
      `Expected 400, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  });
});
