/**
 * Industry Vertical Gate
 * --------------------------------------------
 * Small drop-in helper so app.js can show/hide features based on the
 * logged-in tenant's industry (generic / cold_chain / biomedical).
 *
 * Usage in index.html (load BEFORE app.js):
 *   <script src="/js/industry-gate.js"></script>
 *
 * After the user logs in (or on page load if a token exists), call:
 *   await UTTAG.bootIndustry();   // hits /api/tenant/auth/me
 *
 * Then anywhere in app.js:
 *   if (UTTAG.hasFeature("cold_excursion")) { ... }
 *   UTTAG.gateElement(document.querySelector("#haccp-tab"), "haccp_daily");
 *
 * Or declaratively in HTML:
 *   <a href="#haccp" data-feature="haccp_daily">HACCP 日報</a>
 *   UTTAG.applyGatesToDOM();   // hides any [data-feature] not in the allowlist
 */
(function (global) {
  "use strict";

  const LS_KEY = "uttag_industry_ctx";

  const state = {
    industry: null,        // "generic" | "cold_chain" | "biomedical"
    features: [],          // string[]
    defaults: null,        // { temp_min, temp_max, ... , default_primary_color, ... }
    booted: false,
  };

  function saveCache(ctx) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ctx)); } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clearCache() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }

  function getToken() {
    // Support a few common localStorage keys that app.js might be using.
    return localStorage.getItem("tenant_token")
        || localStorage.getItem("token")
        || localStorage.getItem("jwt")
        || null;
  }

  // Static feature maps for demo mode (no tenant login yet). Mirrors the seed
  // rows in supabase-migration-phase5-industry.sql so demo behavior matches prod.
  const STATIC_INDUSTRY_DEFAULTS = {
    generic: {
      display_name: "通用 Demo",
      // Demo tenant sees everything — mirrors the pitch deck behavior.
      features: [
        "dashboard","map","tags","alerts","reports","settings",
        "transit_monitor","haccp_daily","cold_excursion",
        "batch_tracking","compliance_trail"
      ],
      report_templates: [
        "daily_summary","weekly_summary",
        "haccp_daily","cold_excursion","transit_report",
        "batch_traceability","compliance_21cfr11"
      ],
      default_primary_color: "#0066cc",
      temp_min: -20, temp_max: 60, humidity_min: 0, humidity_max: 100,
    },
    cold_chain: {
      display_name: "冷鏈運輸",
      features: ["dashboard","map","tags","alerts","transit_monitor","haccp_daily","cold_excursion","reports","settings"],
      report_templates: ["haccp_daily","cold_excursion","transit_report"],
      default_primary_color: "#006ba6",
      temp_min: 2, temp_max: 8, humidity_min: 30, humidity_max: 85,
    },
    biomedical: {
      display_name: "生醫 / 疫苗",
      features: ["dashboard","map","tags","alerts","batch_tracking","compliance_trail","reports","settings"],
      report_templates: ["batch_traceability","compliance_21cfr11","cold_excursion"],
      default_primary_color: "#8b1a1a",
      temp_min: 2, temp_max: 8, humidity_min: 20, humidity_max: 60,
    },
  };

  // Query-string override: ?industry=cold_chain. Useful for demo URLs and QA.
  function getQueryIndustry() {
    try {
      const p = new URLSearchParams(location.search).get("industry");
      return (p && STATIC_INDUSTRY_DEFAULTS[p]) ? p : null;
    } catch (_) { return null; }
  }

  // Manual override from app.js or dev console. Persists across reloads.
  function setIndustry(name) {
    if (!STATIC_INDUSTRY_DEFAULTS[name]) {
      console.warn("[industry-gate] unknown industry:", name);
      return false;
    }
    state.industry = name;
    state.defaults = STATIC_INDUSTRY_DEFAULTS[name];
    state.features = state.defaults.features.slice();
    state.booted = true;
    saveCache({ industry: state.industry, features: state.features, defaults: state.defaults });
    applyBranding();
    applyGatesToDOM();
    return true;
  }

  async function bootIndustry({ force = false } = {}) {
    if (state.booted && !force) return state;

    // Query-string override wins over everything else (demo / QA).
    const q = getQueryIndustry();
    if (q) {
      setIndustry(q);
      return state;
    }

    // Fast path: hydrate from cache first so UI doesn't flash.
    const cached = loadCache();
    if (cached) {
      state.industry = cached.industry || "generic";
      state.features = cached.features || [];
      state.defaults = cached.defaults || null;
    }

    const token = getToken();
    if (!token) {
      // No tenant token — fall back to demo mode. If nothing cached, default to generic
      // so [data-feature] gates behave deterministically instead of being fail-open.
      if (!state.industry) setIndustry("generic");
      else { state.booted = true; applyBranding(); applyGatesToDOM(); }
      return state;
    }

    try {
      const res = await fetch("/api/tenant/auth/me", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.json();

      state.industry = body.industry || "generic";
      state.defaults = body.industry_defaults || null;
      state.features = Array.isArray(state.defaults?.features)
        ? state.defaults.features
        : [];

      saveCache({
        industry: state.industry,
        features: state.features,
        defaults: state.defaults,
      });
    } catch (err) {
      // Network/token issues — keep cached state if we have it, otherwise fall back to generic.
      if (!state.industry) {
        state.industry = "generic";
        state.features = [];
      }
      // eslint-disable-next-line no-console
      console.warn("[industry-gate] /me failed, using cached/fallback:", err.message);
    }

    state.booted = true;
    applyBranding();
    applyGatesToDOM();
    return state;
  }

  function hasFeature(name) {
    if (!state.features || state.features.length === 0) return true; // fail-open pre-boot
    return state.features.includes(name);
  }

  // Returns true if the element should be hidden given the current industry context.
  // Supports three declarative attributes (any combination):
  //   data-feature="X"           hide unless whitelist contains X
  //   data-industry="a,b"        hide unless current industry is in this list
  //   data-industry-not="a,b"    hide if current industry is in this list
  function shouldHide(el) {
    const feat = el.getAttribute("data-feature");
    if (feat && !hasFeature(feat)) return true;

    const inList = el.getAttribute("data-industry");
    if (inList) {
      const allowed = inList.split(",").map(s => s.trim()).filter(Boolean);
      if (state.industry && !allowed.includes(state.industry)) return true;
    }

    const notList = el.getAttribute("data-industry-not");
    if (notList) {
      const blocked = notList.split(",").map(s => s.trim()).filter(Boolean);
      if (state.industry && blocked.includes(state.industry)) return true;
    }

    return false;
  }

  function gateElement(el, feature) {
    if (!el) return;
    // Back-compat shape: explicit feature arg.
    if (typeof feature === "string" && !hasFeature(feature)) {
      el.style.display = "none";
      el.setAttribute("data-gated", "true");
      return;
    }
    // Attribute-driven shape: inspect the element.
    if (shouldHide(el)) {
      el.style.display = "none";
      el.setAttribute("data-gated", "true");
    }
  }

  function applyGatesToDOM(root = document) {
    const selector = "[data-feature],[data-industry],[data-industry-not]";
    const nodes = root.querySelectorAll(selector);
    nodes.forEach(n => gateElement(n));
  }

  function applyBranding() {
    const color = state.defaults?.default_primary_color;
    if (color) {
      document.documentElement.style.setProperty("--uttag-primary", color);
    }
  }

  function reset() {
    state.industry = null;
    state.features = [];
    state.defaults = null;
    state.booted = false;
    clearCache();
  }

  const UTTAG = global.UTTAG || {};
  UTTAG.bootIndustry = bootIndustry;
  UTTAG.setIndustry = setIndustry;
  UTTAG.hasFeature = hasFeature;
  UTTAG.gateElement = gateElement;
  UTTAG.applyGatesToDOM = applyGatesToDOM;
  UTTAG.resetIndustry = reset;
  Object.defineProperty(UTTAG, "industry", { get: () => state.industry });
  Object.defineProperty(UTTAG, "features", { get: () => state.features.slice() });
  Object.defineProperty(UTTAG, "industryDefaults", { get: () => state.defaults });
  global.UTTAG = UTTAG;
})(window);
