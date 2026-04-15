/**
 * Integration tests for api/auth.js (admin login router).
 *
 * Mocked behaviour:
 *   - lib/supabase.js replaced with createMockSupabase() — no real DB.
 *   - lib/auth-middleware.js's logAudit is a thin wrapper over supabase.insert,
 *     which the mock accepts as a no-op; we don't assert on audit rows here.
 *   - lib/rate-limit.js is a plain in-memory module; each describe block reloads
 *     the router so the limiter state resets between groups.
 *   - bcryptjs is the real library; CORRECT_HASH is pre-hashed once.
 *   - JWT_SECRET set via process.env before module load.
 *   - Express res/req are minimal stubs that record status + JSON body.
 *
 * Covers:
 *   POST /login
 *     1. missing fields → 400
 *     2. non-string inputs → 400
 *     3. correct credentials → 200 + token + resets failed count
 *     4. wrong password → 401, failed_login_count incremented
 *     5. 5th failed attempt → locked_until set
 *     6. locked account (short-circuit) → 423
 *     7. unknown username still runs bcrypt.compare (timing)
 *     8. disabled admin → 403
 *     9. rate limit → 429 after 10 failures
 *   GET /me
 *     10. no token → 401
 *     11. tenant token → 403
 *     12. valid admin token → 200
 *     13. token for deleted admin → 403
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createMockSupabase } = require("./helpers/mock-supabase");

const ROUTER_PATH      = path.resolve(__dirname, "../api/auth.js");
const SUPABASE_PATH    = path.resolve(__dirname, "../lib/supabase.js");
const AUTH_PATH        = path.resolve(__dirname, "../lib/auth.js");
const MIDDLEWARE_PATH  = path.resolve(__dirname, "../lib/auth-middleware.js");
const RATE_LIMIT_PATH  = path.resolve(__dirname, "../lib/rate-limit.js");

const JWT_SECRET = "test-secret-at-least-32-chars-long!!";
const CORRECT_PASSWORD = "correct-password";
const CORRECT_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 10);

function makeMockAdminRow(overrides = {}) {
  return {
    id: "admin-1",
    username: "testadmin",
    password_hash: CORRECT_HASH,
    role: "superadmin",
    status: "active",
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

function injectMockSupabase(mockSupa) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH, filename: SUPABASE_PATH, loaded: true,
    exports: { supabase: mockSupa, getUserScopedClient: () => mockSupa },
    parent: null, children: [], paths: [],
  };
}

function loadRouter() {
  // Blow away require.cache so rate-limit state + mocks are fresh each load.
  delete require.cache[ROUTER_PATH];
  delete require.cache[AUTH_PATH];
  delete require.cache[MIDDLEWARE_PATH];
  delete require.cache[RATE_LIMIT_PATH];
  process.env.JWT_SECRET = JWT_SECRET;
  return require(ROUTER_PATH);
}

/**
 * Minimal Express router driver. Finds the layer whose route.path + method
 * matches, then invokes its handler stack (middleware → final handler).
 */
async function callRoute(router, method, urlPath, { body = {}, headers = {} } = {}) {
  let _status = 200;
  let _body = null;
  let _done = null;

  const res = {
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(s) { _status = s; return this; },
    json(b) { _body = b; if (_done) _done(); return this; },
    end() { if (_done) _done(); return this; },
    get statusCode() { return _status; },
    get body() { return _body; },
  };
  const req = {
    method: method.toUpperCase(),
    url: urlPath,
    path: urlPath,
    headers: { "user-agent": "test", origin: "https://test.example.com", ...headers },
    body,
  };

  const layer = router.stack.find(l =>
    l.route && l.route.path === urlPath && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No route found for ${method} ${urlPath}`);

  const stack = layer.route.stack.map(s => s.handle);
  let i = 0;
  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    _done = finish;

    function next(err) {
      if (err) return reject(err);
      if (finished) return;
      const fn = stack[i++];
      if (!fn) return finish();
      Promise.resolve(fn(req, res, next)).catch(reject);
    }
    next();
  });

  return { req, res };
}

// ── POST /login ──────────────────────────────────────────────────────────────

describe("POST /api/auth/login — input validation", () => {
  test("missing username/password returns 400", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", { body: {} });
    assert.equal(res.statusCode, 400);
  });

  test("non-string input returns 400 (does not throw in bcrypt)", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: { $ne: null }, password: "x" },
    });
    assert.equal(res.statusCode, 400);
  });
});

describe("POST /api/auth/login — correct credentials", () => {
  test("returns 200 + token and resets failed count", async () => {
    const mockSupa = createMockSupabase({
      admins: [makeMockAdminRow({ failed_login_count: 2 })],
    });
    injectMockSupabase(mockSupa);
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "testadmin", password: CORRECT_PASSWORD },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token, "response should contain a token");
    assert.equal(res.body.admin.username, "testadmin");
    assert.equal(res.body.admin.role, "superadmin");

    // Success path must zero failed_login_count + stamp last_login_at
    const resetCall = mockSupa._calls.update.find(c =>
      c.table === "admins" && c.patch.failed_login_count === 0 && c.patch.last_login_at
    );
    assert.ok(resetCall, "should reset failed_login_count and set last_login_at");
  });

  test("username is normalised (trim + lowercase)", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "  TestAdmin  ", password: CORRECT_PASSWORD },
    });
    assert.equal(res.statusCode, 200);
  });
});

describe("POST /api/auth/login — wrong password", () => {
  test("returns 401 and increments failed_login_count", async () => {
    const mockSupa = createMockSupabase({
      admins: [makeMockAdminRow({ failed_login_count: 0 })],
    });
    injectMockSupabase(mockSupa);
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "testadmin", password: "wrong-password" },
    });

    assert.equal(res.statusCode, 401);
    const updateCall = mockSupa._calls.update.find(c =>
      c.table === "admins" && c.patch.failed_login_count === 1
    );
    assert.ok(updateCall, "failed_login_count should be 1");
  });

  test("sets locked_until on 5th failed attempt", async () => {
    const mockSupa = createMockSupabase({
      admins: [makeMockAdminRow({ failed_login_count: 4 })],
    });
    injectMockSupabase(mockSupa);
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "testadmin", password: "wrong-password" },
    });

    assert.equal(res.statusCode, 401);
    const lockCall = mockSupa._calls.update.find(c =>
      c.table === "admins" && c.patch.locked_until != null
    );
    assert.ok(lockCall, "locked_until should be set after 5th failed attempt");
  });
});

describe("POST /api/auth/login — lockout enforcement", () => {
  test("returns 423 when account is currently locked (short-circuits before bcrypt)", async () => {
    const futureTime = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const mockSupa = createMockSupabase({
      admins: [makeMockAdminRow({ locked_until: futureTime, failed_login_count: 5 })],
    });
    injectMockSupabase(mockSupa);
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "testadmin", password: CORRECT_PASSWORD },
    });
    assert.equal(res.statusCode, 423);
  });
});

describe("POST /api/auth/login — unknown username timing path", () => {
  test("still runs bcrypt.compare against dummy hash (401, not early short-circuit)", async () => {
    injectMockSupabase(createMockSupabase({ admins: [] }));
    const router = loadRouter();

    const start = Date.now();
    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "nobody", password: "any-password" },
    });
    const elapsed = Date.now() - start;

    assert.equal(res.statusCode, 401);
    // bcrypt on a $2b$10$ hash is ≥ a few ms even on fast machines.
    assert.ok(elapsed >= 5, `Expected bcrypt timing delay, got ${elapsed}ms`);
  });
});

describe("POST /api/auth/login — disabled admin", () => {
  test("returns 403 when status=disabled even with correct password", async () => {
    injectMockSupabase(createMockSupabase({
      admins: [makeMockAdminRow({ status: "disabled" })],
    }));
    const router = loadRouter();

    const { res } = await callRoute(router, "post", "/login", {
      body: { username: "testadmin", password: CORRECT_PASSWORD },
    });
    assert.equal(res.statusCode, 403);
  });
});

describe("POST /api/auth/login — rate limit", () => {
  test("returns 429 after max failed attempts from same IP", async () => {
    injectMockSupabase(createMockSupabase({ admins: [] }));
    const router = loadRouter();

    // Limiter is 10/15min; skipSuccess refunds 2xx, so 10 failures should exhaust it.
    let last;
    for (let i = 0; i < 11; i++) {
      last = await callRoute(router, "post", "/login", {
        body: { username: "nobody", password: "x" },
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
    }
    assert.equal(last.res.statusCode, 429);
    assert.ok(last.res.body.retry_after_seconds > 0);
  });
});

// ── GET /me ──────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  test("no Authorization header → 401", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const { res } = await callRoute(router, "get", "/me");
    assert.equal(res.statusCode, 401);
  });

  test("tenant token → 403", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const token = jwt.sign({ id: "user-1", type: "tenant_user" }, JWT_SECRET, { expiresIn: "1h" });
    const { res } = await callRoute(router, "get", "/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 403);
  });

  test("valid admin token → 200 with admin profile", async () => {
    injectMockSupabase(createMockSupabase({ admins: [makeMockAdminRow()] }));
    const router = loadRouter();

    const token = jwt.sign(
      { id: "admin-1", username: "testadmin", role: "superadmin", type: "admin" },
      JWT_SECRET, { expiresIn: "1h" }
    );
    const { res } = await callRoute(router, "get", "/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.admin.username, "testadmin");
    assert.equal(res.body.admin.role, "superadmin");
  });

  test("token for nonexistent admin → 403", async () => {
    injectMockSupabase(createMockSupabase({ admins: [] }));
    const router = loadRouter();

    const token = jwt.sign(
      { id: "ghost", username: "ghost", role: "superadmin", type: "admin" },
      JWT_SECRET, { expiresIn: "1h" }
    );
    const { res } = await callRoute(router, "get", "/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 403);
  });

  test("disabled admin → 403", async () => {
    injectMockSupabase(createMockSupabase({
      admins: [makeMockAdminRow({ status: "disabled" })],
    }));
    const router = loadRouter();

    const token = jwt.sign(
      { id: "admin-1", username: "testadmin", role: "superadmin", type: "admin" },
      JWT_SECRET, { expiresIn: "1h" }
    );
    const { res } = await callRoute(router, "get", "/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 403);
  });

  test("malformed token → 401", async () => {
    injectMockSupabase(createMockSupabase({ admins: [] }));
    const router = loadRouter();

    const { res } = await callRoute(router, "get", "/me", {
      headers: { authorization: "Bearer not.a.jwt" },
    });
    assert.equal(res.statusCode, 401);
  });
});
