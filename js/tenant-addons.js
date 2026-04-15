/**
 * tenant-addons.js
 * ================
 * Augments /index.html with tenant-only features:
 *   - 用量 (Usage) panel
 *   - AI 助理 (Claude chat) floating widget
 *
 * Both require TENANT.isLoggedIn(); otherwise they stay hidden.
 * Depends on: tenant-session.js (window.TENANT).
 *
 * Public entry points (auto-wired on DOMContentLoaded):
 *   loadUsage()       - fetches & renders the usage panel
 *   bindAIChat()      - wires the floating chat button/panel
 *
 * This file is loaded on both /index.html and /tenant.html to share
 * one source of truth for the UX.
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, window.TENANT?.getAuthHeader() || {});
    return fetch(url, opts);
  }

  async function fetchJSON(url) {
    const res = await authFetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // ====================================================================
  // Usage
  // ====================================================================
  let usageWired = false;

  async function loadUsage() {
    const container = document.getElementById("usage-container");
    if (!container) return;
    const periodSel = document.getElementById("usage-period");
    const exportBtn = document.getElementById("usage-export");

    if (!usageWired) {
      usageWired = true;
      if (periodSel) periodSel.addEventListener("change", () => loadUsage());
      if (exportBtn) exportBtn.addEventListener("click", () => {
        const p = periodSel?.value || "30d";
        authFetch("/api/tenant/usage/export?period=" + encodeURIComponent(p))
          .then(r => r.blob())
          .then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "usage_" + p + ".csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          })
          .catch(err => alert("匯出失敗：" + err.message));
      });
    }

    container.innerHTML = '<div class="empty-state">載入用量資料…</div>';
    try {
      const data = await fetchJSON("/api/tenant/usage?period=" + encodeURIComponent(periodSel?.value || "30d"));
      renderUsage(container, data);
    } catch (err) {
      container.innerHTML = '<div class="empty-state" style="color:#b91c1c;">載入失敗：' + escapeHtml(err.message) + "</div>";
    }
  }

  function renderUsage(container, data) {
    const s = data.summary || {};
    const daily = data.daily_usage || [];
    const totalCalls = s.api_calls_period || 0;
    const totalErrors = s.api_errors_period || 0;
    const errorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : "0.00";
    const tier = s.tier || "free";

    const bar = (pct) => {
      const safe = Math.min(100, Math.max(0, pct || 0));
      const color = safe >= 90 ? "#dc2626" : safe >= 70 ? "#f59e0b" : "#3b82f6";
      return '<div style="background:var(--border,#e5e7eb);border-radius:4px;height:6px;overflow:hidden;margin-top:4px;">' +
             '<div style="background:' + color + ';height:100%;width:' + safe + '%;transition:width .3s;"></div></div>';
    };

    const card = (label, value, sub) =>
      '<div style="background:var(--card-bg,#f9fafb);border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:14px;">' +
        '<div style="font-size:11px;color:var(--text-muted,#6b7280);margin-bottom:6px;">' + label + '</div>' +
        '<div style="font-size:22px;font-weight:600;">' + value + '</div>' +
        (sub || '') +
      '</div>';

    const summaryHtml =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">' +
        card("方案", '<span style="text-transform:capitalize;">' + escapeHtml(tier) + '</span>') +
        card("API 呼叫 (期間)", totalCalls.toLocaleString()) +
        card("錯誤數", totalErrors.toLocaleString(),
             '<div style="font-size:11px;color:var(--text-muted,#6b7280);margin-top:4px;">錯誤率 ' + errorRate + '%</div>') +
        card("綁定裝置",
             (s.devices_bound || 0) + (s.devices_limit ? " / " + s.devices_limit : ""),
             s.devices_limit ? bar(s.devices_quota_percent) : "") +
        card("活躍 API Keys",
             (s.api_keys_active || 0) + (s.api_keys_limit ? " / " + s.api_keys_limit : ""),
             s.api_keys_limit ? bar(s.api_keys_quota_percent) : "") +
        card("成員人數", s.users_count || 0) +
      '</div>';

    const chartHtml = drawUsageChart(daily);
    const roiHtml = renderROICalculator();
    container.innerHTML = summaryHtml + chartHtml + roiHtml;
    wireROI();
  }

  // ─────────── ROI 試算器 ───────────
  function renderROICalculator() {
    return `
      <div class="roi-card" style="margin-top:24px;background:linear-gradient(135deg,rgba(224,30,90,.06),rgba(168,85,247,.04));border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-size:14px;font-weight:700;">💰 採用本系統你可以省多少？</div>
            <div style="font-size:11px;color:var(--text-muted,#6b7280);margin-top:2px;">輸入貴司實際數字，立刻看到年度 ROI</div>
          </div>
          <button id="roi-reset" class="btn-ghost" style="font-size:11px;padding:4px 10px;">預設值</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
          ${roiField("roi-pallets", "每月出貨棧板", "4000", "個")}
          ${roiField("roi-value", "平均每棧板貨值", "8000", "元")}
          ${roiField("roi-loss", "目前遺失率", "0.4", "%")}
          ${roiField("roi-delay", "目前延遲率", "3.5", "%")}
          ${roiField("roi-spoil", "冷鏈損壞率", "0.8", "%")}
          ${roiField("roi-saved-loss", "導入後遺失率", "0.05", "%")}
          ${roiField("roi-saved-delay", "導入後延遲率", "1.2", "%")}
          ${roiField("roi-saved-spoil", "導入後損壞率", "0.1", "%")}
        </div>
        <div id="roi-result" style="margin-top:14px;padding:14px;background:var(--card-bg,#fff);border-radius:8px;border:1px dashed var(--accent,#e01e5a);">
          計算中…
        </div>
      </div>
    `;
  }

  function roiField(id, label, value, unit) {
    return `
      <div>
        <div style="font-size:11px;color:var(--text-muted,#6b7280);margin-bottom:3px;">${label}</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <input id="${id}" type="number" value="${value}" step="any" style="flex:1;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:5px;font:inherit;font-size:13px;background:var(--card-bg,#fff);color:var(--text,#111);" />
          <span style="font-size:11px;color:var(--text-muted,#6b7280);">${unit}</span>
        </div>
      </div>
    `;
  }

  function computeROI() {
    const num = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
    const pallets = num("roi-pallets");
    const val = num("roi-value");
    const lossNow = num("roi-loss") / 100;
    const lossAfter = num("roi-saved-loss") / 100;
    const delayNow = num("roi-delay") / 100;
    const delayAfter = num("roi-saved-delay") / 100;
    const spoilNow = num("roi-spoil") / 100;
    const spoilAfter = num("roi-saved-spoil") / 100;

    const monthly = pallets * val;
    const delayCost = 200; // 每筆延遲罰款/人力額外成本概估
    const lossSaving = monthly * (lossNow - lossAfter);
    const delaySaving = pallets * delayCost * (delayNow - delayAfter);
    const spoilSaving = monthly * (spoilNow - spoilAfter);
    const totalMonthly = Math.max(0, lossSaving + delaySaving + spoilSaving);
    const yearly = totalMonthly * 12;

    const fmt = n => "NT$ " + Math.round(n).toLocaleString();
    const pct = (before, after) => before > 0 ? Math.round(((before - after) / before) * 100) : 0;

    return {
      html: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-muted,#6b7280);">遺失減少</div>
            <div style="font-size:18px;font-weight:700;color:var(--accent,#e01e5a);">${fmt(lossSaving * 12)}<span style="font-size:11px;font-weight:400;color:var(--text-muted);">/年</span></div>
            <div style="font-size:10px;color:var(--text-muted);">↓ ${pct(lossNow, lossAfter)}%</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-muted,#6b7280);">延遲減少</div>
            <div style="font-size:18px;font-weight:700;color:var(--accent,#e01e5a);">${fmt(delaySaving * 12)}<span style="font-size:11px;font-weight:400;color:var(--text-muted);">/年</span></div>
            <div style="font-size:10px;color:var(--text-muted);">↓ ${pct(delayNow, delayAfter)}%</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-muted,#6b7280);">冷鏈損壞減少</div>
            <div style="font-size:18px;font-weight:700;color:var(--accent,#e01e5a);">${fmt(spoilSaving * 12)}<span style="font-size:11px;font-weight:400;color:var(--text-muted);">/年</span></div>
            <div style="font-size:10px;color:var(--text-muted);">↓ ${pct(spoilNow, spoilAfter)}%</div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border,#e5e7eb);display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:var(--text-muted,#6b7280);">年度總節省</div>
            <div style="font-size:28px;font-weight:900;background:linear-gradient(90deg,#e01e5a,#a855f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${fmt(yearly)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--text-muted,#6b7280);">每月 ≈</div>
            <div style="font-size:16px;font-weight:700;">${fmt(totalMonthly)}</div>
          </div>
        </div>
      `,
    };
  }

  function wireROI() {
    const ids = ["roi-pallets","roi-value","roi-loss","roi-delay","roi-spoil","roi-saved-loss","roi-saved-delay","roi-saved-spoil"];
    const update = () => {
      const r = computeROI();
      const el = document.getElementById("roi-result");
      if (el) el.innerHTML = r.html;
    };
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", update);
    });
    document.getElementById("roi-reset")?.addEventListener("click", () => {
      const defaults = { "roi-pallets":"4000","roi-value":"8000","roi-loss":"0.4","roi-delay":"3.5","roi-spoil":"0.8","roi-saved-loss":"0.05","roi-saved-delay":"1.2","roi-saved-spoil":"0.1" };
      Object.entries(defaults).forEach(([id,v]) => { const el = document.getElementById(id); if (el) el.value = v; });
      update();
    });
    update();
  }

  function drawUsageChart(daily) {
    if (!daily || daily.length === 0) {
      return '<div class="empty-state" style="padding:24px;margin-top:12px;">這段期間沒有 API 呼叫紀錄</div>';
    }
    const W = 720, H = 200, padL = 40, padR = 16, padT = 16, padB = 28;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const max = Math.max(1, ...daily.map(d => d.request_count));
    const xStep = daily.length > 1 ? innerW / (daily.length - 1) : 0;
    const points = daily.map((d, i) => {
      const x = padL + i * xStep;
      const y = padT + innerH - (d.request_count / max) * innerH;
      return [x, y, d];
    });
    const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const areaD = pathD + " L" + points[points.length-1][0].toFixed(1) + "," + (padT + innerH) +
                  " L" + points[0][0].toFixed(1) + "," + (padT + innerH) + " Z";
    const errorPath = points.map((p, i) => {
      const y = padT + innerH - (p[2].error_count / max) * innerH;
      return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const yLabels = [0, 0.5, 1].map(f => {
      const v = Math.round(max * f);
      const y = padT + innerH - f * innerH;
      return '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#6b7280">' + v + '</text>' +
             '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-dasharray="2,2" />';
    }).join("");
    let xLabels = "";
    const showCount = Math.min(7, daily.length);
    const step = Math.max(1, Math.floor(daily.length / showCount));
    for (let i = 0; i < daily.length; i += step) {
      const x = padL + i * xStep;
      const label = (daily[i].date || "").slice(5);
      xLabels += '<text x="' + x + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#6b7280">' + label + '</text>';
    }
    const dots = points.map(p =>
      '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#3b82f6">' +
      '<title>' + (p[2].date || "") + ': ' + p[2].request_count + ' 次 / ' + p[2].error_count + ' 錯誤</title>' +
      '</circle>').join("");
    return '<div style="margin-top:16px;">' +
      '<div style="font-size:13px;font-weight:600;margin:8px 0 4px;">每日 API 呼叫趨勢</div>' +
      '<div style="display:flex;gap:14px;font-size:11px;color:var(--text-muted,#6b7280);margin-bottom:6px;">' +
        '<span><span style="display:inline-block;width:10px;height:2px;background:#3b82f6;vertical-align:middle;margin-right:4px;"></span>呼叫數</span>' +
        '<span><span style="display:inline-block;width:10px;height:2px;background:#dc2626;vertical-align:middle;margin-right:4px;"></span>錯誤數</span>' +
      '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;">' +
        yLabels +
        '<path d="' + areaD + '" fill="#3b82f6" fill-opacity="0.08" />' +
        '<path d="' + pathD + '" stroke="#3b82f6" stroke-width="2" fill="none" />' +
        '<path d="' + errorPath + '" stroke="#dc2626" stroke-width="1.5" fill="none" stroke-dasharray="4,3" />' +
        dots +
        xLabels +
      '</svg>' +
    '</div>';
  }

  // ====================================================================
  // AI 助理 (Claude)
  // ====================================================================
  const aiHistory = [];
  let aiContextCache = null;
  let aiContextFetchedAt = 0;
  let aiWired = false;

  async function gatherAIContext() {
    if (aiContextCache && Date.now() - aiContextFetchedAt < 60_000) return aiContextCache;
    const ctx = {};
    const probes = [
      ["/api/tenant/usage?period=30d", d => {
        ctx.summary = d.summary || null;
        ctx.usage = (d.daily_usage || []).map(u => ({ date: u.date, calls: u.request_count, errors: u.error_count }));
      }],
      ["/api/tenant/alerts", d => {
        ctx.alerts = (d.alerts || []).slice(0, 30).map(a => ({
          time: a.at, mac: a.mac, label: a.label, kind: a.kind,
          value: a.value, threshold: a.threshold, severity: a.severity,
        }));
      }],
      ["/api/tenant/devices", d => {
        const devices = Array.isArray(d) ? d : (d.devices || []);
        ctx.tags = devices.slice(0, 50).map(t => ({
          mac: t.mac, label: t.label, status: t.status,
          temp: t.latest_data?.temperature, last_seen: t.latest_data?.created_at,
        }));
      }],
    ];
    await Promise.all(probes.map(async ([url, apply]) => {
      try { apply(await fetchJSON(url)); } catch { /* skip */ }
    }));
    aiContextCache = ctx;
    aiContextFetchedAt = Date.now();
    return ctx;
  }

  function aiAppend(role, content, meta) {
    const list = document.getElementById("ai-messages");
    if (!list) return;
    const isUser = role === "user";
    const align = isUser ? "flex-end" : "flex-start";
    const bg = isUser ? "var(--accent,#3b82f6)" : "var(--card-bg,#fff)";
    const color = isUser ? "#fff" : "var(--text,#111)";
    const safe = escapeHtml(content).replace(/\n/g, "<br>");
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `display:flex;justify-content:${align};margin-bottom:10px;`;
    wrapper.innerHTML =
      `<div style="max-width:84%;background:${bg};color:${color};padding:8px 12px;border-radius:12px;border:1px solid var(--border,#e5e7eb);box-shadow:0 1px 2px rgba(0,0,0,.04);">${safe}` +
      (meta ? `<div style="font-size:10px;color:${isUser ? "rgba(255,255,255,.7)" : "var(--text-muted,#6b7280)"};margin-top:4px;">${escapeHtml(meta)}</div>` : "") +
      `</div>`;
    list.appendChild(wrapper);
    list.scrollTop = list.scrollHeight;
  }

  async function aiSend(text) {
    const sendBtn = document.getElementById("ai-send");
    const input = document.getElementById("ai-input");
    const msg = (text || input?.value || "").trim();
    if (!msg) return;
    if (input) input.value = "";
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "..."; }
    aiAppend("user", msg);
    aiHistory.push({ role: "user", content: msg });

    const typing = document.createElement("div");
    typing.id = "ai-typing";
    typing.style.cssText = "color:var(--text-muted,#6b7280);font-size:11px;padding:0 4px 8px;";
    typing.textContent = "AI 思考中…";
    document.getElementById("ai-messages")?.appendChild(typing);

    try {
      const context = await gatherAIContext();
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, window.TENANT?.getAuthHeader() || {}),
        body: JSON.stringify({ messages: aiHistory, context }),
      });
      document.getElementById("ai-typing")?.remove();
      if (!resp.ok) {
        const t = await resp.text();
        aiAppend("assistant", "（無法取得回覆）" + t.slice(0, 200), `HTTP ${resp.status}`);
        return;
      }
      const data = await resp.json();
      const reply = data.reply || "（沒有回覆內容）";
      const meta = data.usage ? `${data.model || ""} · ${data.usage.input_tokens || 0} in / ${data.usage.output_tokens || 0} out` : (data.model || "");
      aiAppend("assistant", reply, meta);
      aiHistory.push({ role: "assistant", content: reply });
    } catch (e) {
      document.getElementById("ai-typing")?.remove();
      aiAppend("assistant", "錯誤：" + e.message);
    } finally {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "送出"; }
      input?.focus();
    }
  }

  function bindAIChat() {
    if (aiWired) return;
    const fab = document.getElementById("ai-fab");
    const panel = document.getElementById("ai-panel");
    const close = document.getElementById("ai-close");
    const form = document.getElementById("ai-form");
    const list = document.getElementById("ai-messages");
    if (!fab || !panel || !form) return;
    aiWired = true;

    const open = () => {
      panel.style.display = "flex";
      fab.style.display = "none";
      if (list && list.childElementCount === 0) {
        aiAppend("assistant", "嗨！我可以幫你查 API 用量、最近告警、裝置狀態。試試左下範例問題或直接問。");
      }
      document.getElementById("ai-input")?.focus();
    };
    const closeFn = () => {
      panel.style.display = "none";
      fab.style.display = "flex";
    };

    fab.addEventListener("click", open);
    close?.addEventListener("click", closeFn);
    form.addEventListener("submit", e => { e.preventDefault(); aiSend(); });
    document.querySelectorAll(".ai-suggest").forEach(b =>
      b.addEventListener("click", () => aiSend(b.textContent))
    );
  }

  // ====================================================================
  // Auto-show tenant-only UI
  // ====================================================================
  function revealTenantUI() {
    if (!window.TENANT?.isLoggedIn()) return;
    document.querySelectorAll("[data-tenant-only]").forEach(el => {
      el.style.removeProperty("display");
      el.classList.remove("hidden");
    });
    bindAIChat();
  }

  function init() {
    revealTenantUI();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.UTTAG_ADDONS = { loadUsage, bindAIChat, gatherAIContext };
})(window);
