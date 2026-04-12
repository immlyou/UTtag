/**
 * Unit tests for js/industry-gate.js
 *
 * industry-gate.js is written as a browser IIFE that closes over `window`.
 * We stub the required browser globals (window, localStorage, document,
 * location) before loading the module so it runs in Node.
 *
 * Mocked globals (documented here):
 *   - global.window        — self-referential so `global.UTTAG = UTTAG` works
 *   - global.localStorage  — in-memory Map-backed stub (getItem/setItem/removeItem)
 *   - global.document      — minimal stub: documentElement.style, querySelectorAll
 *   - global.location      — { search: "" } so getQueryIndustry() finds nothing
 *   - global.fetch         — never called in these tests (no bootIndustry)
 *
 * Each reload helper does `delete global.UTTAG` before require() to prevent
 * "Cannot redefine property: industry" — the IIFE calls Object.defineProperty
 * on UTTAG.industry at load time; if global.UTTAG already has that non-configurable
 * property from a prior load, the defineProperty throws.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../js/industry-gate.js");

// ── DOM stubs ──────────────────────────────────────────────────────────────

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

/**
 * Load (or reload) the industry-gate module with the given document stub.
 * Always deletes global.UTTAG first to avoid "Cannot redefine property" errors.
 */
function reloadWithDoc(doc) {
  delete require.cache[MODULE_PATH];
  delete global.UTTAG;            // must clear before each load

  const ls = makeLocalStorage();
  global.window = global;
  global.localStorage = ls;
  global.location = { search: "" };
  global.document = doc || {
    documentElement: { style: { setProperty() {} } },
    querySelectorAll() { return { forEach() {} }; },
  };
  global.fetch = async () => { throw new Error("fetch not expected in unit tests"); };

  require(MODULE_PATH);
  return { UTTAG: global.UTTAG, ls };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("STATIC_INDUSTRY_DEFAULTS", () => {
  test("module loads without throwing (STATIC_INDUSTRY_DEFAULTS is accessible)", () => {
    assert.doesNotThrow(() => reloadWithDoc());
  });
});

describe("UTTAG.setIndustry", () => {
  test("setIndustry('cold_chain') makes hasFeature('haccp_daily') return true", () => {
    const { UTTAG } = reloadWithDoc();
    UTTAG.setIndustry("cold_chain");
    assert.equal(UTTAG.hasFeature("haccp_daily"), true);
  });

  test("setIndustry('biomedical') makes hasFeature('transit_monitor') return false", () => {
    const { UTTAG } = reloadWithDoc();
    UTTAG.setIndustry("biomedical");
    // biomedical features: dashboard,map,tags,alerts,batch_tracking,compliance_trail,reports,settings
    assert.equal(UTTAG.hasFeature("transit_monitor"), false);
  });

  test("setIndustry('unknown') returns false and does not change industry state", () => {
    const { UTTAG } = reloadWithDoc();
    UTTAG.setIndustry("generic");
    const industryBefore = UTTAG.industry;

    const result = UTTAG.setIndustry("unknown_industry");
    assert.equal(result, false);
    assert.equal(UTTAG.industry, industryBefore);
  });
});

describe("UTTAG.applyGatesToDOM", () => {
  function makeNode(attrs) {
    return {
      _style: {},
      _attrs: { ...attrs },
      getAttribute(k) { return this._attrs[k] || null; },
      setAttribute(k, v) { this._attrs[k] = v; },
      get style() { return this._style; },
    };
  }

  function docWithNode(node) {
    return {
      documentElement: { style: { setProperty() {} } },
      querySelectorAll() { return { forEach: cb => cb(node) }; },
    };
  }

  test("hides element with data-feature not in features list for biomedical industry", () => {
    const node = makeNode({ "data-feature": "haccp_daily" });
    const { UTTAG } = reloadWithDoc(docWithNode(node));
    // biomedical does not have haccp_daily — setIndustry calls applyGatesToDOM
    UTTAG.setIndustry("biomedical");
    assert.equal(node._style.display, "none");
  });

  test("hides element with data-industry-not that matches current industry", () => {
    const node = makeNode({ "data-industry-not": "cold_chain" });
    const { UTTAG } = reloadWithDoc(docWithNode(node));
    UTTAG.setIndustry("cold_chain");
    assert.equal(node._style.display, "none");
  });

  test("hides element with data-industry that does NOT include current industry", () => {
    const node = makeNode({ "data-industry": "biomedical" }); // only show for biomedical
    const { UTTAG } = reloadWithDoc(docWithNode(node));
    UTTAG.setIndustry("cold_chain"); // not biomedical → should hide
    assert.equal(node._style.display, "none");
  });
});
