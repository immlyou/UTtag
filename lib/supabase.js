/**
 * Supabase clients.
 *
 * Three callable shapes — pick the right one for the request:
 *
 *   supabase              (legacy export, = getAdminClient())
 *     Service role key. BYPASSES Row-Level Security.
 *     Keep using this for: ingestion, schedulers, impersonation,
 *     anywhere the backend has no user context of its own.
 *
 *   getAdminClient()
 *     Same thing, explicit name. Use this in new code so it's obvious
 *     when we deliberately want RLS bypass.
 *
 *   getUserScopedClient(req)
 *     Per-request client that forwards the caller's Bearer token to
 *     PostgREST. When the token is a real Supabase JWT (signed with
 *     SUPABASE_JWT_SECRET), PostgREST populates
 *     `current_setting('request.jwt.claims', true)` and the RLS
 *     policies in supabase-migration-phase5b-rls.sql kick in.
 *
 * ⚠ RLS caveat (see issue #6)
 *   Our tenant JWTs are currently signed with process.env.JWT_SECRET,
 *   which is NOT necessarily the Supabase project's JWT secret. For
 *   PostgREST to accept the token and populate claims, either:
 *     (a) set JWT_SECRET = SUPABASE_JWT_SECRET (easiest), OR
 *     (b) split: sign tenant tokens with SUPABASE_JWT_SECRET and admin
 *         tokens with something else.
 *   Until that is done, getUserScopedClient() will silently fall back
 *   to the admin client so handlers keep working. Call
 *   `isUserScopingActive()` to detect whether true RLS is in effect.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;

// Single service-role client. Reused across requests — cheap, no auth state.
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// True when we have everything needed to route a request through RLS.
// Handlers can branch on this while we migrate.
function isUserScopingActive() {
  return Boolean(ANON_KEY);
}

function extractBearerToken(req) {
  const h = req && req.headers && req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * Build a per-request Supabase client configured to forward the caller's
 * JWT to PostgREST. Returns the admin client if:
 *   - SUPABASE_ANON_KEY is not configured yet, OR
 *   - the request has no Bearer token.
 */
function getUserScopedClient(req) {
  if (!ANON_KEY) return adminClient;
  const token = extractBearerToken(req);
  if (!token) return adminClient;

  // Create a lightweight client — creation is cheap and stateless because
  // we disable session persistence. Could be cached per-token later if
  // the request volume warrants; for now simplicity wins.
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
}

function getAdminClient() { return adminClient; }

module.exports = {
  // Back-compat: existing `const { supabase } = require("./supabase")` keeps working.
  supabase: adminClient,
  getAdminClient,
  getUserScopedClient,
  isUserScopingActive,
  extractBearerToken,
};
