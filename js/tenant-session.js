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

  // ------------------------------------------------------------
  // Tenant banner (only renders when logged in)
  // ------------------------------------------------------------
  function renderBanner() {
    if (!isLoggedIn()) return;
    // Idempotent: skip if already present.
    if (document.getElementById("uttag-tenant-banner")) return;

    var user = getUser() || {};
    var industryLabel = ({
      generic: "通用 Demo",
      cold_chain: "冷鏈運輸",
      biomedical: "生醫 / 疫苗",
    })[user.industry] || user.industry || "";

    var bar = document.createElement("div");
    bar.id = "uttag-tenant-banner";
    bar.setAttribute("style", [
      "position:fixed","top:0","right:0","z-index:9999",
      "background:var(--uttag-primary,#0066cc)","color:#fff",
      "padding:6px 12px","font:12px/1.4 system-ui,sans-serif",
      "border-bottom-left-radius:6px","display:flex","gap:10px","align-items:center",
      "box-shadow:0 2px 6px rgba(0,0,0,.15)"
    ].join(";"));

    bar.innerHTML =
      '<span style="opacity:.85">' + (user.client_name || "") + "</span>" +
      '<span style="opacity:.6">|</span>' +
      "<strong>" + (user.email || user.name || "") + "</strong>" +
      (industryLabel ? '<span style="background:rgba(255,255,255,.18);padding:2px 6px;border-radius:3px">' + industryLabel + "</span>" : "") +
      '<button id="uttag-tenant-logout" style="background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;padding:2px 8px;border-radius:3px;cursor:pointer;font:inherit">登出</button>';

    (document.body || document.documentElement).appendChild(bar);
    var btn = document.getElementById("uttag-tenant-logout");
    if (btn) btn.addEventListener("click", logout);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner);
  } else {
    renderBanner();
  }

  // ------------------------------------------------------------
  // Fetch interceptor: auto-logout on 401/403 from tenant-scoped APIs.
  // Only wraps /api/tenant/* and /api/mobile/* — leaves admin paths alone.
  // ------------------------------------------------------------
  var _origFetch = global.fetch ? global.fetch.bind(global) : null;
  if (_origFetch) {
    global.fetch = function patchedFetch(input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var isTenantScoped = /^\/api\/tenant\//.test(url) || /^\/api\/mobile\//.test(url);
      return _origFetch(input, init).then(function (res) {
        if (isTenantScoped && isLoggedIn() && (res.status === 401 || res.status === 403)) {
          console.warn("[tenant-session] " + res.status + " on " + url + " — logging out");
          logout();
        }
        return res;
      });
    };
  }

  global.TENANT = TENANT;
})(window);
