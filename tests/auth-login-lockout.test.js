/**
 * Integration tests for api/auth/login.js
 *
 * Mocked behaviour (documented here):
 *   - lib/supabase.js is replaced with createMockSupabase() so no real DB is touched.
 *   - bcryptjs is the real library (already a dep) — we use real hashes so the timing
 *     path is exercised correctly. We pre-hash "correct-password" at $2b$10$ rounds.
 *   - lib/auth.js JWT_SECRET is set via process.env before module load.
 *   - Express res/req are minimal stubs that record status + JSON body.
 *   - We reload the handler module via delete require.cache to isolate each test.
 *
 * Tests:
 *   1. correct credentials → 200 + token in response
 *   2. wrong password → 401, failed_login_count incremented
 *   3. 5th failed attempt → locked_until is set
 *   4. locked account → 423
 *   5. unknown username still runs bcrypt.compare (timing path does not short-circuit)
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { createMockSupabase } = require("./helpers/mock-supabase");

const LOGIN_PATH   = path.resolve(__dirname, "../api/auth/login.js");
const SUPABASE_PATH = path.resolve(__dirname, "../lib/supabase.js");
const AUTH_PATH    = path.resolve(__dirname, "../lib/auth.js");

// Pre-hash once at top level (slow but only run once)
const CORRECT_PASSWORD = "correct-password";
let CORRECT_HASH;
// We'll generate it in a before-all style by doing it synchronously
CORRECT_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 10);

function makeMockAdminRow(overrides = {}) {
  return {
    id: "admin-1",
    username: "testadmin",
    password_hash: CORRECT_HASH,
    role: "superadmin",
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    ...overrides,
  };
}

function injectMockSupabase(mockSupa) {
  require.cache[SUPABASE_PATH] = {
    id: SUPABASE_PATH,
    filename: SUPABASE_PATH,
    loaded: true,
    exports: { supabase: mockSupa },
    parent: null, children: [], paths: [],
  };
}

function loadHandler() {
  delete require.cache[LOGIN_PATH];
  delete require.cache[AUTH_PATH];
  // Ensure JWT_SECRET is set
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-at-least-32-chars-long!!";
  return require(LOGIN_PATH);
}

function makeReqRes(body = {}) {
  let statusCode = null;
  let responseBody = null;
  const res = {
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(s) { statusCode = s; return this; },
    json(b) { responseBody = b; return this; },
    end() {},
    get statusCode() { return statusCode; },
    get body() { return responseBody; },
  };
  const req = {
    method: "POST",
    headers: { origin: "https://test.example.com" },
    body,
  };
  return { req, res };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("auth/login — correct credentials", () => {
  test("returns 200 and a token when username and password are correct", async () => {
    const mockSupa = createMockSupabase({
      admins: [makeMockAdminRow()],
    });
    injectMockSupabase(mockSupa);
    const handler = loadHandler();

    const { req, res } = makeReqRes({ username: "testadmin", password: CORRECT_PASSWORD });
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token, "response should contain a token");
    assert.equal(res.body.username, "testadmin");
  });
});

describe("auth/login — wrong password", () => {
  test("returns 401 and increments failed_login_count", async () => {
    const adminRow = makeMockAdminRow({ failed_login_count: 0 });
    const mockSupa = createMockSupabase({ admins: [adminRow] });
    injectMockSupabase(mockSupa);
    const handler = loadHandler();

    const { req, res } = makeReqRes({ username: "testadmin", password: "wrong-password" });
    await handler(req, res);

    assert.equal(res.statusCode, 401);
    // Check the mock recorded an update call that includes failed_login_count: 1
    const updateCall = mockSupa._calls.update.find(c =>
      c.table === "admins" && c.patch.failed_login_count === 1
    );
    assert.ok(updateCall, "failed_login_count should have been incremented to 1");
  });

  test("sets locked_until after 5 failed attempts", async () => {
    // Simulate the account already having 4 failed attempts
    const adminRow = makeMockAdminRow({ failed_login_count: 4 });
    const mockSupa = createMockSupabase({ admins: [adminRow] });
    injectMockSupabase(mockSupa);
    const handler = loadHandler();

    const { req, res } = makeReqRes({ username: "testadmin", password: "wrong-password" });
    await handler(req, res);

    assert.equal(res.statusCode, 401);
    // The update patch should contain locked_until (not null)
    const lockCall = mockSupa._calls.update.find(c =>
      c.table === "admins" && c.patch.locked_until != null
    );
    assert.ok(lockCall, "locked_until should be set after 5th failed attempt");
  });
});

describe("auth/login — lockout enforcement", () => {
  test("returns 423 when account is currently locked", async () => {
    const futureTime = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const adminRow = makeMockAdminRow({ locked_until: futureTime, failed_login_count: 5 });
    const mockSupa = createMockSupabase({ admins: [adminRow] });
    injectMockSupabase(mockSupa);
    const handler = loadHandler();

    const { req, res } = makeReqRes({ username: "testadmin", password: CORRECT_PASSWORD });
    await handler(req, res);

    assert.equal(res.statusCode, 423);
  });
});

describe("auth/login — unknown username timing path", () => {
  test("still calls bcrypt.compare (dummy hash) when account does not exist", async () => {
    // Empty admins table — no rows for the username
    const mockSupa = createMockSupabase({ admins: [] });
    injectMockSupabase(mockSupa);
    const handler = loadHandler();

    const start = Date.now();
    const { req, res } = makeReqRes({ username: "nobody", password: "any-password" });
    await handler(req, res);
    const elapsed = Date.now() - start;

    // Should still respond 401 (not 404 or early short-circuit)
    assert.equal(res.statusCode, 401);
    // bcrypt.compare on dummy hash takes ≥ a few ms — confirms the timing path ran.
    // We use a loose lower bound (5ms) to avoid flakiness on fast machines.
    assert.ok(elapsed >= 5, `Expected bcrypt timing delay, got ${elapsed}ms`);
  });
});
