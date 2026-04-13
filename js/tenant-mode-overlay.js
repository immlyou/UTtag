/**
 * tenant-mode-overlay.js
 * --------------------------------------------
 * Paints a tenant / impersonation experience on top of /index.html
 * without touching app.js.
 *
 *   1. Immediately adds `body.tenant-mode` class when a tenant (or
 *      impersonation) session is active, so CSS rules keyed on that
 *      class can hide admin-only UI (`.admin-only`).
 *
 *   2. Renders a small top banner with: client name, user email,
 *      industry badge, logout button. Impersonation sessions show a
 *      distinct yellow banner with a "結束代入" button.
 *
 *   3. After the devices list has had time to load, checks for empty
 *      state (0 bound tags) and shows a one-line gentle hint so the
 *      tenant isn't staring at a blank map with no idea what's wrong.
 *
 * Load BEFORE app.js so the body class is set before app.js measures
 * the viewport or runs its layout logic.
 */
(function (global) {
  "use strict";

  function readToken(k) { return localStorage.getItem(k) || null; }
  var ADMIN_KEY  = "utfind_admin_token";
  var TENANT_KEY = "tenant_token";

  function getTokenPayload(tok) {
    if (!tok) return null;
    try {
      return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_) { return null; }
  }

  var adminTok  = readToken(ADMIN_KEY);
  var tenantTok = readToken(TENANT_KEY);
  var tenantPayload = getTokenPayload(tenantTok);
  var isImpersonation = Boolean(tenantPayload && tenantPayload.impersonated_by);
  var inTenantMode = Boolean(tenantTok);  // tenant login OR impersonation both count

  // --- Step 1: paint body class immediately (before app.js measures) ---
  if (inTenantMode) {
    if (document.body) {
      document.body.classList.add("tenant-mode");
      if (isImpersonation) document.body.classList.add("impersonation-mode");
    } else {
      // <head> scripts: defer to body ready
      document.addEventListener("DOMContentLoaded", function () {
        document.body.classList.add("tenant-mode");
        if (isImpersonation) document.body.classList.add("impersonation-mode");
      });
    }
  }

  if (!inTenantMode) return;  // admin sees nothing new; bail.

  // --- Utility: a safe, lazy user object ---
  function readTenantUser() {
    try {
      var raw = localStorage.getItem("tenant_user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function industryLabel(key) {
    return ({
      generic: "通用 Demo",
      cold_chain: "冷鏈運輸",
      biomedical: "生醫 / 疫苗",
    })[key] || key || "";
  }

  function logout() {
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem("tenant_user");
    localStorage.removeItem("uttag_industry_ctx");
    // If this was an impersonation, the admin's own token stays put
    // (we never touch ADMIN_KEY here); landing on /tenant-login.html is fine.
    window.location.href = "/tenant-login.html";
  }

  function endImpersonation() {
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem("tenant_user");
    localStorage.removeItem("uttag_industry_ctx");
    // Admin token preserved — back to admin view.
    window.location.href = "/admin-impersonate.html";
  }

  // --- Step 2: render top banner ---
  function renderBanner() {
    if (document.getElementById("uttag-tenant-banner")) return;

    var user = readTenantUser() || {};
    var industry = tenantPayload && tenantPayload.industry;
    var clientName = tenantPayload && tenantPayload.client_name;
    var bar = document.createElement("div");
    bar.id = "uttag-tenant-banner";
    bar.className = isImpersonation ? "uttag-banner impersonation" : "uttag-banner";

    var left = [
      clientName ? "<span class=\"uttag-banner-client\">" + esc(clientName) + "</span>" : "",
      "<span class=\"uttag-banner-sep\">·</span>",
      "<span class=\"uttag-banner-user\">" + esc(user.email || user.name || tenantPayload?.email || "") + "</span>",
      industry ? "<span class=\"uttag-banner-badge\">" + esc(industryLabel(industry)) + "</span>" : "",
    ].join("");

    var right = isImpersonation
      ? '<strong class="uttag-banner-warning">⚠ admin 代入中</strong> <button id="uttag-end-imp" class="uttag-banner-btn">結束代入</button>'
      : '<button id="uttag-logout" class="uttag-banner-btn">登出</button>';

    bar.innerHTML = '<div class="uttag-banner-left">' + left + '</div><div class="uttag-banner-right">' + right + '</div>';
    document.body.appendChild(bar);

    var logoutBtn = document.getElementById("uttag-logout");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
    var endBtn = document.getElementById("uttag-end-imp");
    if (endBtn) endBtn.addEventListener("click", endImpersonation);
  }

  // --- Step 3: empty-state hint (show only if 0 devices after 3s) ---
  function checkEmptyState() {
    // Wait past app.js's initial loads to avoid flashing the hint.
    setTimeout(function () {
      fetch("/api/clients/tags").then(function (r) {
        if (!r.ok) return;
        return r.json();
      }).then(function (devices) {
        if (!Array.isArray(devices) || devices.length > 0) return;
        if (document.getElementById("uttag-empty-hint")) return;
        var hint = document.createElement("div");
        hint.id = "uttag-empty-hint";
        hint.className = "uttag-empty-hint";
        hint.innerHTML =
          '<div class="uttag-empty-title">尚未綁定任何裝置</div>' +
          '<div class="uttag-empty-body">請聯絡系統管理員協助綁定第一個 Tag。綁定完成後重新整理本頁即可看到資料。</div>' +
          '<button id="uttag-empty-dismiss" class="uttag-banner-btn">我知道了</button>';
        document.body.appendChild(hint);
        var dismissBtn = document.getElementById("uttag-empty-dismiss");
        if (dismissBtn) dismissBtn.addEventListener("click", function () {
          hint.remove();
        });
      }).catch(function (_) { /* swallow */ });
    }, 3000);
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c];
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      renderBanner();
      checkEmptyState();
    });
  } else {
    renderBanner();
    checkEmptyState();
  }
})(window);
