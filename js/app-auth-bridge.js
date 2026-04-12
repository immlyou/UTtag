/**
 * app-auth-bridge.js
 * --------------------------------------------
 * Tiny shim that runs BEFORE app.js on the admin page (index.html).
 *
 * Current state of the app:
 *   - /index.html (+ app.js, 8600 lines) is still the superadmin UI.
 *     It authenticates with localStorage['utfind_admin_token'].
 *   - /tenant.html is the per-tenant dashboard for regular tenant users.
 *
 * Purpose of this bridge:
 *   - If someone lands on /index.html with ONLY a tenant token
 *     (e.g. a tenant user clicked a bookmark, or an admin impersonation
 *     session hasn't cleared), punt them to /tenant.html so they do not
 *     see an admin UI they cannot use.
 *   - Expose window.UTTAG_AUTH for any downstream code (and future
 *     app.js work) to reason about which auth mode is active.
 *
 * It intentionally does NOT:
 *   - Modify existing app.js fetch calls (that is the M1 big refactor
 *     tracked separately).
 *   - Log anyone out; only redirects.
 */
(function (global) {
  "use strict";

  var adminTok  = localStorage.getItem("utfind_admin_token");
  var tenantTok = localStorage.getItem("tenant_token");

  var mode =
    adminTok  ? "admin" :
    tenantTok ? "tenant" :
                "anon";

  // Redirect tenant-only sessions away from the admin page.
  // Only applies when we're on the root / admin path, not anywhere else.
  var path = location.pathname;
  var isAdminPage = path === "/" || path === "/index.html";

  if (isAdminPage && !adminTok && tenantTok) {
    // Avoid a redirect loop in the rare case tenant.html breaks.
    var ref = document.referrer || "";
    if (ref.indexOf("/tenant.html") === -1) {
      window.location.replace("/tenant.html");
      return;
    }
  }

  global.UTTAG_AUTH = {
    mode: mode,
    hasAdminToken:  Boolean(adminTok),
    hasTenantToken: Boolean(tenantTok),
    // Helper for any fetch wrapper that wants to choose a header.
    preferredAuthHeader: function () {
      if (adminTok)  return { Authorization: "Bearer " + adminTok };
      if (tenantTok) return { Authorization: "Bearer " + tenantTok };
      return {};
    },
  };
})(window);
