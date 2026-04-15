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
        "letter-spacing:.3px","box-shadow:0 2px 6px rgba(0,0,0,.15)"
      ].join(";");
      bar.innerHTML =
        '<span style="background:rgba(255,255,255,.22);padding:2px 8px;border-radius:10px;font-size:11px;margin-right:10px;">' + t.short + '</span>' +
        t.label +
        ' <a href="?demo=off" style="color:#fff;opacity:.7;margin-left:12px;font-size:11px;text-decoration:underline;">切回原版</a>';
      document.body.appendChild(bar);

      // 把 body 往下推，避免 banner 蓋住內容
      const offset = 28;
      document.body.style.paddingTop = offset + "px";
      // 手動把已經 fixed 到頂部的其他 bar 往下推
      const existingBanners = document.querySelectorAll("#uttag-tenant-banner");
      existingBanners.forEach(b => {
        b.style.top = offset + "px";
      });
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
      /* sidebar 整條改粉紅漸層 */
      .nav-sidebar, aside.nav-sidebar { background: ${bg} !important; border-right: 1px solid rgba(0,0,0,.2) !important; }
      .nav-btn { color: rgba(255,255,255,.85) !important; }
      .nav-btn:hover { background: rgba(255,255,255,.15) !important; color: #fff !important; }
      .nav-btn.active { background: rgba(255,255,255,.25) !important; color: #fff !important; }
      .nav-btn.active::before { background: #fff !important; }

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
    `;
    document.head.appendChild(s);
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
})(window);
