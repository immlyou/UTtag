"use strict";

/**
 * Unit tests for lib/supabase.js — user-scoped client helper.
 *
 * These tests do not talk to Supabase. They stub @supabase/supabase-js's
 * createClient so we can assert what options the helper would pass.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const Module = require("node:module");

function freshRequire(modulePath, envOverrides, mockCreateClient) {
  // Wipe the require cache for both our target and the supabase package
  // so env + mocks take effect.
  const abs = require.resolve(modulePath);
  delete require.cache[abs];
  const supaPath = require.resolve("@supabase/supabase-js");
  delete require.cache[supaPath];

  // Monkey-patch the supabase module's exports before require.
  const original = require("@supabase/supabase-js");
  const calls = [];
  const patched = Object.assign({}, original, {
    createClient: function (url, key, opts) {
      calls.push({ url, key, opts });
      return { __stub: true, url, key, opts };
    },
  });
  require.cache[supaPath].exports = patched;

  const savedEnv = {};
  for (const k of Object.keys(envOverrides)) {
    savedEnv[k] = process.env[k];
    if (envOverrides[k] === undefined) delete process.env[k];
    else process.env[k] = envOverrides[k];
  }

  try {
    const mod = require(abs);
    return { mod, calls };
  } finally {
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    // Restore the real supabase export.
    require.cache[supaPath].exports = original;
    delete require.cache[abs];
  }
}

test("isUserScopingActive — false when SUPABASE_ANON_KEY missing", () => {
  const { mod } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: undefined,
  });
  assert.strictEqual(mod.isUserScopingActive(), false);
});

test("isUserScopingActive — true when SUPABASE_ANON_KEY present", () => {
  const { mod } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: "anon-xxx",
  });
  assert.strictEqual(mod.isUserScopingActive(), true);
});

test("getUserScopedClient falls back to admin client without ANON_KEY", () => {
  const { mod } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: undefined,
  });
  const req = { headers: { authorization: "Bearer user-jwt-abc" } };
  const c = mod.getUserScopedClient(req);
  assert.strictEqual(c, mod.getAdminClient());
});

test("getUserScopedClient falls back to admin client when no Bearer token", () => {
  const { mod } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: "anon-xxx",
  });
  const req = { headers: {} };
  const c = mod.getUserScopedClient(req);
  assert.strictEqual(c, mod.getAdminClient());
});

test("getUserScopedClient forwards Bearer token as Authorization header", () => {
  const { mod, calls } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: "anon-xxx",
  });
  const req = { headers: { authorization: "Bearer tenant-jwt-42" } };
  const c = mod.getUserScopedClient(req);

  assert.notStrictEqual(c, mod.getAdminClient(), "should be a new client, not the admin one");
  // The last createClient call was the scoped one (admin was constructed at module load).
  const scoped = calls[calls.length - 1];
  assert.strictEqual(scoped.key, "anon-xxx", "must use anon key, not service key");
  assert.strictEqual(
    scoped.opts.global.headers.Authorization,
    "Bearer tenant-jwt-42",
    "must forward the caller's token to PostgREST"
  );
});

test("extractBearerToken handles missing and malformed inputs", () => {
  const { mod } = freshRequire("../lib/supabase", {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_KEY: "svc-xxx",
    SUPABASE_ANON_KEY: "anon-xxx",
  });
  assert.strictEqual(mod.extractBearerToken({}), null);
  assert.strictEqual(mod.extractBearerToken({ headers: {} }), null);
  assert.strictEqual(mod.extractBearerToken({ headers: { authorization: "Basic abc" } }), null);
  assert.strictEqual(mod.extractBearerToken({ headers: { authorization: "Bearer " } }), null);
  assert.strictEqual(mod.extractBearerToken({ headers: { authorization: "Bearer abc" } }), "abc");
});
