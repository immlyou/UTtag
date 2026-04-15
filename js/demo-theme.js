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
    if (t.primaryHover) root.style.setProperty("--accent-hover", t.primaryHover);

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

  function renameKPIs(map) {
    if (!map) return;
    // 等 DOM 出來再找 i18n 節點替換（app.js 會隨語言切換重新渲染，用 MutationObserver 保持）
    const doRename = () => {
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (map[key]) el.textContent = map[key];
      });
    };
    doRename();
    // 若 app.js 稍後才渲染 KPI，用 observer 補上
    const kpi = document.getElementById("kpi-grid");
    if (kpi) {
      const obs = new MutationObserver(doRename);
      obs.observe(kpi, { subtree: true, childList: true, characterData: true });
    }
    // 一秒後再跑一次當保險
    setTimeout(doRename, 1500);
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
