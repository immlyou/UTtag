/**
 * demo-theme.js
 * -------------
 * Paint the UI with a client-specific demo theme. Activated by `?demo=momo`
 * in the URL (persists via localStorage once set).
 *
 * Supported themes:
 *   momo    — MOMO 電子商務（棧板追蹤）
 *   generic — 恢復預設 UTtag 藍
 *
 * Exit by visiting `?demo=off` or calling UTTAG_DEMO.clear() in devtools.
 */
(function (global) {
  "use strict";

  const LS_KEY = "uttag_demo_theme";

  const THEMES = {
    momo: {
      label: "MOMO 電商棧板追蹤 — 示範環境",
      short: "MOMO Demo",
      primaryColor: "#e01e5a",
      primaryHover: "#c01848",
      logo: "MOMO",
      kpiRenames: {
        "total": "棧板總數",
        "online": "運送中",
        "lowbat": "低電量",
        "tempAlert": "冷鏈異常",
        "sos": "SOS / 失物",
      },
      bannerBg: "linear-gradient(90deg,#e01e5a 0%,#f06292 100%)",
    },
  };

  function getActive() {
    const q = new URLSearchParams(location.search).get("demo");
    if (q === "off") {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    if (q && THEMES[q]) {
      localStorage.setItem(LS_KEY, q);
      return q;
    }
    const saved = localStorage.getItem(LS_KEY);
    return saved && THEMES[saved] ? saved : null;
  }

  function applyTheme(name) {
    const t = THEMES[name];
    if (!t) return;

    // 1. CSS 變數覆寫
    const root = document.documentElement;
    root.style.setProperty("--uttag-primary", t.primaryColor);
    root.style.setProperty("--accent", t.primaryColor);
    root.style.setProperty("--accent-glow", "rgba(224,30,90,0.25)");
    if (t.primaryHover) root.style.setProperty("--accent-hover", t.primaryHover);

    // 1b. 注入 CSS 讓差異「大到一眼看見」
    injectThemeCSS(t);

    // 2. 頂部 banner（固定在畫面最頂、不擋內容太多）
    if (!document.getElementById("demo-theme-banner")) {
      const bar = document.createElement("div");
      bar.id = "demo-theme-banner";
      bar.style.cssText = [
        "position:fixed","top:0","left:0","right:0","z-index:10000",
        "background:" + t.bannerBg,
        "color:#fff","padding:6px 14px","text-align:center",
        "font:13px/1.4 system-ui,-apple-system,sans-serif","font-weight:600",
        "letter-spacing:.3px","box-shadow:0 2px 6px rgba(0,0,0,.15)",
        "height:28px","line-height:16px"
      ].join(";");
      bar.innerHTML =
        '<span style="background:rgba(255,255,255,.22);padding:2px 8px;border-radius:10px;font-size:11px;margin-right:10px;">' + t.short + '</span>' +
        t.label +
        ' <a href="?demo=off" style="color:#fff;opacity:.7;margin-left:12px;font-size:11px;text-decoration:underline;">切回原版</a>';
      document.body.appendChild(bar);

      // 把所有 fixed 元素往下讓位給 demo banner
      const offset = 28;
      document.documentElement.style.setProperty("--demo-banner-offset", offset + "px");
      document.body.style.paddingTop = offset + "px";
      // nav-rail
      const rail = document.getElementById("nav-rail");
      if (rail) { rail.style.top = offset + "px"; rail.style.height = "calc(100vh - " + offset + "px)"; }
      // mobile header
      const mobileHeader = document.getElementById("mobile-header");
      if (mobileHeader) mobileHeader.style.top = offset + "px";
      // mobile drawer
      const mobileDrawer = document.getElementById("mobile-drawer");
      if (mobileDrawer) mobileDrawer.style.top = offset + "px";
      // sidebar
      const sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.style.marginTop = "0";
      // tenant banner
      const tbar = document.getElementById("uttag-tenant-banner");
      if (tbar) tbar.style.top = offset + "px";
      // 其他 top:0 的 fixed 元素
      setTimeout(() => {
        document.querySelectorAll("#uttag-tenant-banner, .uttag-banner").forEach(b => {
          if (getComputedStyle(b).top === "0px") b.style.top = offset + "px";
        });
      }, 100);
    }

    // 3. KPI 文字改名
    renameKPIs(t.kpiRenames);

    // 4. 暴露全域狀態
    global.UTTAG_DEMO = {
      active: name,
      theme: t,
      clear: () => { localStorage.removeItem(LS_KEY); location.reload(); },
    };

    document.title = t.short + " · " + (document.title || "UTtag");
  }

  function injectThemeCSS(t) {
    if (document.getElementById("demo-theme-css")) return;
    const s = document.createElement("style");
    s.id = "demo-theme-css";
    const bg = t.bannerBg || ("linear-gradient(180deg," + t.primaryColor + " 0%,#b01449 100%)");
    s.textContent = `
      /* ──── MOMO Demo 主題（drama 版） ──── */
      /* sidebar 整條改粉紅漸層（真實 selector 是 #nav-rail） */
      #nav-rail { background: ${bg} !important; border-right: 1px solid rgba(0,0,0,.2) !important; box-shadow: 2px 0 10px rgba(224,30,90,.25) !important; }
      #nav-rail .nav-btn { color: rgba(255,255,255,.8) !important; }
      #nav-rail .nav-btn:hover { background: rgba(0,0,0,.25) !important; color: #fff !important; }
      #nav-rail .nav-btn.active { background: rgba(255,255,255,.95) !important; color: ${t.primaryColor} !important; }
      #nav-rail .nav-btn.active::before { background: ${t.primaryColor} !important; }
      #nav-rail .nav-btn svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,.25)); }

      /* 連線鈕 + 主要按鈕 */
      #btn-connect { background: linear-gradient(135deg,${t.primaryColor},${t.primaryHover || "#b01449"}) !important; }
      #btn-connect:hover { box-shadow: 0 4px 20px rgba(224,30,90,.45) !important; }
      .btn-accent { background: ${t.primaryColor} !important; }
      .btn-accent:hover { background: ${t.primaryHover || "#b01449"} !important; }

      /* KPI 卡片與圖標 tint */
      .kpi-icon { color: ${t.primaryColor} !important; }

      /* 地圖 tile 微調（整體染粉） */
      .leaflet-tile-pane { filter: hue-rotate(280deg) saturate(1.1); }
      /* marker 換色：app.js 用內嵌 SVG/DivIcon，這裡用 filter 讓藍色 marker 變粉 */
      .leaflet-marker-icon:not(.leaflet-marker-shadow) { filter: hue-rotate(280deg) saturate(1.5); }

      /* 面板標題強調 */
      .panel-header h2::before { color: ${t.primaryColor}; }

      /* 左上 Logo 改 MOMO 風格 */
      .nav-logo {
        background: linear-gradient(135deg,#fff,#fce7ef) !important;
        color: ${t.primaryColor} !important;
        font-weight: 900 !important;
        letter-spacing: 0.5px !important;
        font-size: 13px !important;
        box-shadow: 0 2px 10px rgba(255,255,255,.35), inset 0 0 0 1px rgba(255,255,255,.4) !important;
        border-radius: 10px !important;
      }

      /* KPI 數字 粉紅光暈 */
      .kpi-value {
        color: #fff !important;
        text-shadow: 0 0 8px rgba(224,30,90,.55), 0 0 18px rgba(224,30,90,.35) !important;
        font-weight: 800 !important;
      }
      .kpi-blue .kpi-value,
      .kpi-red .kpi-value,
      .kpi-amber .kpi-value,
      .kpi-purple .kpi-value,
      .kpi-cyan .kpi-value {
        color: ${t.primaryColor} !important;
      }

      /* Toast 加 MOMO 品牌條 + 粉紅左邊框 */
      .toast {
        border-left: 4px solid ${t.primaryColor} !important;
        background: linear-gradient(90deg, rgba(224,30,90,.08) 0%, var(--bg-card,#fff) 40%) !important;
        box-shadow: 0 10px 30px rgba(224,30,90,.18) !important;
      }
      .toast::before {
        content: "MOMO";
        position: absolute;
        top: -8px;
        left: 14px;
        background: ${t.primaryColor};
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.4px;
      }
      .toast { position: relative !important; }

      /* Spinner 粉紅 */
      .spinner {
        border-color: rgba(224,30,90,.15) !important;
        border-top-color: ${t.primaryColor} !important;
      }
    `;
    document.head.appendChild(s);

    // 替換 logo 文字
    const logo = document.querySelector(".nav-logo");
    if (logo && logo.textContent.trim() === "UT") logo.textContent = "MO";
  }

  function renameKPIs(map) {
    if (!map) return;
    // 僅針對 [data-i18n]、且只有在需要改時才寫入（避免和數字動畫互相觸發）
    const doRename = () => {
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        const want = map[key];
        if (want && el.textContent !== want) el.textContent = want;
      });
    };
    doRename();
    // 退場式觸發：只在幾個時間點補跑，不持續 observe（避免被動畫高頻觸發）
    [300, 1500, 4000, 10_000].forEach(t => setTimeout(doRename, t));
    // 切換語言也要重跑
    document.querySelectorAll("#btn-lang").forEach(btn => {
      btn.addEventListener("click", () => setTimeout(doRename, 100));
    });
  }

  const active = getActive();
  if (active) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyTheme(active));
    } else {
      applyTheme(active);
    }
  }

  // 設定頁的一鍵切換按鈕
  function syncToggleButton() {
    const btn = document.getElementById("btn-momo-demo-toggle");
    const status = document.getElementById("momo-demo-status");
    if (!btn) return;
    const on = localStorage.getItem(LS_KEY) === "momo";
    btn.textContent = on ? "切回原版（停用 MOMO Demo）" : "載入 MOMO Demo";
    btn.classList.toggle("btn-accent", !on);
    btn.classList.toggle("btn-ghost", on);
    if (status) status.textContent = on ? "目前狀態：MOMO Demo 已啟用" : "目前狀態：原版 UTtag";
  }

  global.toggleMomoDemo = function () {
    const on = localStorage.getItem(LS_KEY) === "momo";
    if (on) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, "momo");
    location.reload();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncToggleButton);
  } else {
    syncToggleButton();
  }
})(window);
