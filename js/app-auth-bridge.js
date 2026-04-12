/**
 * app-auth-bridge.js
 * --------------------------------------------
 * Runs BEFORE app.js on /index.html. Two jobs:
 *
 *   1. REDIRECT  — if only a tenant_token exists (no admin token), punt to
 *      /tenant.html so tenant users don't see the admin UI.
 *
 *   2. FETCH ROUTING — patch window.fetch so app.js's existing calls route
 *      to the right token based on URL prefix, without app.js needing a
 *      single edit. This enables the Phase 5 tenant-dual-mode endpoints
 *      (see lib/auth-middleware.js::dualAuth) to be consumed from app.js
 *      by either a superadmin or a tenant user without any code change.
 *
 * Routing table (first match wins):
 *   /api/tenant/*       -> tenant_token
 *   /api/mobile/*       -> tenant_token
 *   /api/admin/*        -> admin_token
 *   /api/auth/*         -> no token (login, logout, register)
 *   /api/(everything)   -> admin_token if present, else tenant_token
 *                          (these are legacy endpoints that switched to
 *                          dual-mode auth in Phase 5 M2)
 *   non-/api/           -> unchanged
 *
 * Behaviour rules:
 *   - If the caller already set an Authorization header, we do NOT overwrite.
 *   - If the chosen token is absent, we leave the request alone (caller
 *     will get a normal 401, same as before the patch).
 *   - WebSocket / EventSource / navigator.sendBeacon are NOT used by app.js
 *     (grep-verified), so we don't patch them. If that changes, patch here.
 */
(function (global) {
  "use strict";

  function readToken(key) { return localStorage.getItem(key) || null; }

  function currentAdminToken()  { return readToken("utfind_admin_token"); }
  function currentTenantToken() { return readToken("tenant_token"); }

  // --- Redirect tenant-only sessions away from the admin page ---
  var path = location.pathname;
  var isAdminPage = path === "/" || path === "/index.html";

  if (isAdminPage && !currentAdminToken() && currentTenantToken()) {
    var ref = document.referrer || "";
    if (ref.indexOf("/tenant.html") === -1) {
      window.location.replace("/tenant.html");
      return;
    }
  }

  // --- Fetch interceptor: URL-based token routing ---
  function pickTokenForUrl(url) {
    var admin  = currentAdminToken();
    var tenant = currentTenantToken();

    if (/^\/api\/tenant\//.test(url))  return tenant || null;
    if (/^\/api\/mobile\//.test(url))  return tenant || null;
    if (/^\/api\/admin\//.test(url))   return admin  || null;
    if (/^\/api\/auth\//.test(url))    return null;           // login has no auth yet

    // Legacy endpoints in /api/* (clients, sensors, b2b, keys, usage, schedules, chat):
    // Phase 5 M2 made these dual-mode. Prefer admin because superadmins are the
    // historical callers; fall back to tenant (useful for impersonation + future
    // tenant-driven paths).
    if (/^\/api\//.test(url)) return admin || tenant || null;

    return null;
  }

  function headerHasAuthorization(headers) {
    if (!headers) return false;
    if (headers instanceof Headers) return headers.has("authorization");
    if (Array.isArray(headers)) return headers.some(function (p) { return p && p[0] && p[0].toLowerCase() === "authorization"; });
    if (typeof headers === "object") {
      for (var k in headers) if (k.toLowerCase() === "authorization") return true;
    }
    return false;
  }

  var _origFetch = global.fetch ? global.fetch.bind(global) : null;
  if (_origFetch) {
    global.fetch = function patchedFetch(input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (!/^\/api\//.test(url)) return _origFetch(input, init);

      // Respect an explicit Authorization set by the caller.
      if (init && headerHasAuthorization(init.headers)) return _origFetch(input, init);
      if (input instanceof Request && input.headers && input.headers.has && input.headers.has("authorization")) {
        return _origFetch(input, init);
      }

      var tok = pickTokenForUrl(url);
      if (!tok) return _origFetch(input, init);

      // Merge Authorization into init.headers without mutating caller's object.
      var nextInit = Object.assign({}, init || {});
      var h = nextInit.headers;
      if (h instanceof Headers) {
        var clone = new Headers(h);
        clone.set("Authorization", "Bearer " + tok);
        nextInit.headers = clone;
      } else if (Array.isArray(h)) {
        nextInit.headers = h.slice().concat([["Authorization", "Bearer " + tok]]);
      } else {
        nextInit.headers = Object.assign({}, h || {}, { Authorization: "Bearer " + tok });
      }
      return _origFetch(input, nextInit);
    };
  }

  // --- Public surface for any downstream code that wants to introspect ---
  global.UTTAG_AUTH = {
    get mode() {
      if (currentAdminToken())  return "admin";
      if (currentTenantToken()) return "tenant";
      return "anon";
    },
    get hasAdminToken()  { return Boolean(currentAdminToken()); },
    get hasTenantToken() { return Boolean(currentTenantToken()); },
    preferredAuthHeader: function () {
      var t = currentAdminToken() || currentTenantToken();
      return t ? { Authorization: "Bearer " + t } : {};
    },
    // Exposed for tests / manual verification.
    _pickTokenForUrl: pickTokenForUrl,
  };
})(window);
