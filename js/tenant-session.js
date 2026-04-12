/**
 * tenant-session.js
 * =================
 * Exposes `window.TENANT` — a thin session helper for tenant users.
 *
 * Load order in index.html
 * ------------------------
 *   <script src="/js/industry-gate.js"></script>
 *   <script src="/js/tenant-session.js"></script>   <!-- this file -->
 *   <script src="app.js"></script>
 *
 * Public API
 * ----------
 *   TENANT.isLoggedIn()      -> boolean
 *   TENANT.token             -> string | null
 *   TENANT.user              -> object | null  (id, email, name, role, client_id, client_name, industry)
 *   TENANT.getAuthHeader()   -> { Authorization: "Bearer <token>" } | {}
 *   TENANT.logout()          -> void  (clears storage, redirects to /tenant-login.html)
 *
 * Integrating with app.js (future work)
 * --------------------------------------
 * When app.js is ready to support tenant users alongside admin users:
 *
 *   1. Replace `localStorage.getItem('utfind_admin_token')` guards with a
 *      check that also accepts `TENANT.isLoggedIn()`.
 *
 *   2. When building fetch headers, call:
 *        const headers = TENANT.isLoggedIn()
 *          ? TENANT.getAuthHeader()
 *          : { 'x-api-key': adminToken };
 *
 *   3. Use `UTTAG.industry` (from industry-gate.js) to conditionally show
 *      industry-specific panels — both files are already loaded before app.js.
 *
 * This file does NOT break the existing admin flow.
 * It is entirely inert when no tenant_token is present in localStorage.
 */
(function (global) {
  "use strict";

  var LS_TOKEN = "tenant_token";
  var LS_USER  = "tenant_user";
  var LS_IND   = "uttag_industry_ctx";

  function getToken() {
    return localStorage.getItem(LS_TOKEN) || null;
  }

  function getUser() {
    try {
      var raw = localStorage.getItem(LS_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function getAuthHeader() {
    var tok = getToken();
    return tok ? { Authorization: "Bearer " + tok } : {};
  }

  function logout() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_IND);
    window.location.href = "/tenant-login.html";
  }

  var TENANT = {
    isLoggedIn:    isLoggedIn,
    getAuthHeader: getAuthHeader,
    logout:        logout,
  };

  Object.defineProperty(TENANT, "token", { get: getToken, enumerable: true });
  Object.defineProperty(TENANT, "user",  { get: getUser,  enumerable: true });

  global.TENANT = TENANT;
})(window);
