// ========== 設定 ==========
const API_BASE = "/api/v1/tags";
const PLAN_LIMITS = {
  Basic:        { rateLimit: 30, maxTags: 100 },
  Professional: { rateLimit: 15, maxTags: 500 },
  Enterprise:   { rateLimit: null, maxTags: null },
};
const AUTO_REFRESH_INTERVAL = 120; // 加長到 2 分鐘，減少 API 呼叫
const API_COOLDOWN = 31000; // 31 秒冷卻（Basic 方案 30 秒 + 1 秒緩衝）
let lastApiCallTime = 0; // 上次 API 呼叫的時間戳
const TEMP_MIN = 2;
const TEMP_MAX = 8;
const TRACK_COLORS = ["#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#10b981", "#f97316", "#6366f1", "#14b8a6"];

let apiKey = "";
let allTags = [];
let latestData = [];
let markers = {};
let historyLine = null;
let historyLines = [];
let historyMarkers = [];
let autoRefreshTimer = null;
let autoRefreshCountdown = 0;
let tagAliases = JSON.parse(localStorage.getItem("utfind_aliases") || "{}");
let currentLayer = null;
let currentFilter = "all";
let historyRawData = [];     // 供匯出用
let playbackData = [];
let playbackIndex = 0;
let playbackTimer = null;
let playbackMarker = null;
let playbackSpeed = 100;

// 測量
let measureMode = false;
let measurePoints = [];
let measureMarkers = [];
let measureLine = null;

// 地址反查
let geocodeMode = false;
let geocodeMarker = null;

// 新功能狀態
let heatmapLayer = null;
let heatmapOn = false;
let clusterGroup = null;
let clusterOn = false;
let soundEnabled = true;
let currentLang = localStorage.getItem("utfind_lang") || "zh";
let eventLog = JSON.parse(localStorage.getItem("utfind_events") || "[]").slice(0, 200);
let tempHistory = {};   // mac -> [temp values] for sparkline
let batHistory = {};    // mac -> [bat values] for sparkline

// 產業功能 i18n
const LANG_INDUSTRY = {
  zh: { coldchain: "冷鏈管理", logistics: "物流追蹤", reports: "報表與分析", groupsAssets: "群組與資產", settingsIntegration: "設定與整合" },
  en: { coldchain: "Cold Chain", logistics: "Logistics", reports: "Reports", groupsAssets: "Groups & Assets", settingsIntegration: "Settings" },
};

// 地理圍欄
let geofences = JSON.parse(localStorage.getItem("utfind_geofences") || "[]");
let geofenceCircles = {};
let geofencePickMode = false;
let geofencePickLatLng = null;
let geofenceTempCircle = null;

// 手動 Tag（不在 API /all 中，但可透過 /latest 追蹤）
let manualTags = JSON.parse(localStorage.getItem("utfind_manual_tags") || "[]");

// 通知追蹤
let lastNotifiedSos = new Set();
let lastNotifiedLowBat = new Set();
let lastNotifiedTemp = new Set();

// ========== 地圖初始化 ==========
const map = L.map("map", { zoomControl: false }).setView([23.5, 121], 7);
L.control.zoom({ position: "bottomleft" }).addTo(map);

const tileLayers = {
  street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OSM', maxZoom: 19,
  }),
  satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: '&copy; Esri', maxZoom: 19,
  }),
  topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenTopoMap', maxZoom: 17,
  }),
};
currentLayer = tileLayers.street;
currentLayer.addTo(map);

function switchLayer(name, btn) {
  if (currentLayer) map.removeLayer(currentLayer);
  currentLayer = tileLayers[name];
  currentLayer.addTo(map);
  document.querySelectorAll(".layer-btn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

// 地圖點擊處理
map.on("click", (e) => {
  if (poiPickMode) {
    poiPickLatLng = e.latlng;
    poiPickMode = false;
    document.getElementById("btn-poi-pick").textContent = `已選取 (${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)})`;
    return;
  }
  if (geofencePickMode) {
    geofencePickLatLng = e.latlng;
    geofencePickMode = false;
    document.getElementById("btn-geofence-pick").textContent = `已選取 (${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)})`;
    drawTempGeofence();
    return;
  }
  if (measureMode) {
    addMeasurePoint(e.latlng);
    return;
  }
  if (geocodeMode) {
    reverseGeocode(e.latlng);
    return;
  }
});

// ========== Marker 圖示 ==========
function createIcon(status) {
  const color = status === "sos" ? "#ef4444" : "#3b82f6";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:28px;height:28px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);${status === "sos" ? "animation:pulse 1s infinite;" : ""}"></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
}

function createHistoryIcon(index, total, color) {
  const opacity = 0.3 + (index / total) * 0.7;
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:10px;height:10px;background:${color || "rgba(139,92,246," + opacity + ")"};opacity:${color ? opacity : 1};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.2);"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  });
}

function createStartEndIcon(type) {
  return L.divIcon({
    className: "",
    html: `<div class="history-label ${type}">${type === "start" ? "S" : "E"}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

// ========== API 呼叫（含冷卻管控） ==========
async function waitForCooldown() {
  const elapsed = Date.now() - lastApiCallTime;
  if (elapsed < API_COOLDOWN) {
    const waitMs = API_COOLDOWN - elapsed;
    // 用倒數計時更新 UI，讓使用者知道在等待
    const updateCooldownUI = (sec) => {
      const msg = `<span class="spinner"></span>API 冷卻中，${sec} 秒後繼續...`;
      // 更新所有可能可見的狀態欄
      ["key-status", "history-status"].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.closest(".panel")?.classList.contains("active")) {
          el.className = "status info";
          el.innerHTML = msg;
        }
      });
    };
    let remaining = Math.ceil(waitMs / 1000);
    updateCooldownUI(remaining);
    // 每秒更新倒數
    const countdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) updateCooldownUI(remaining);
    }, 1000);
    await delay(waitMs);
    clearInterval(countdownTimer);
  }
}

async function apiCall(endpoint, body, _retryCount = 0) {
  await waitForCooldown();
  lastApiCallTime = Date.now();

  const resp = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey, ...body }),
  });
  const data = await resp.json();

  // 代理可能不轉發原始 HTTP 狀態碼，所以也檢查 body 裡的 code
  const isError = !resp.ok || (data.code && data.code !== 200);
  if (isError) {
    const retryAfter = data.result?.retryAfter;
    // 429 自動等待後重試（最多重試 2 次）
    if (retryAfter && _retryCount < 2) {
      const status = document.getElementById("key-status");
      if (status) {
        status.className = "status info";
        status.innerHTML = `<span class="spinner"></span>API 冷卻中，${retryAfter} 秒後自動重試...`;
      }
      await delay(retryAfter * 1000 + 1000);
      lastApiCallTime = Date.now() - API_COOLDOWN; // 重置冷卻計時
      return apiCall(endpoint, body, _retryCount + 1);
    }
    const msg = data.result?.message || data.message || `錯誤 ${data.code || resp.status}`;
    throw new Error(msg);
  }
  return data.result;
}

// ========== 手動 Tag 管理 ==========
function mergeManualTags() {
  const existingMacs = new Set(allTags.map(t => t.mac));
  manualTags.forEach(mac => {
    if (!existingMacs.has(mac)) {
      allTags.push({ mac, manual: true });
    }
  });
}

function addManualTag() {
  const input = document.getElementById("manual-tag-input");
  const mac = (input.value || "").trim().toUpperCase();
  if (!mac) return;
  // 簡單格式驗證 (XX:XX:XX:XX:XX:XX)
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
    showToast("MAC 格式不正確，應為 XX:XX:XX:XX:XX:XX", "error");
    return;
  }
  if (manualTags.includes(mac)) {
    showToast("此 Tag 已在手動列表中", "info");
    return;
  }
  manualTags.push(mac);
  localStorage.setItem("utfind_manual_tags", JSON.stringify(manualTags));
  input.value = "";
  renderManualTagList();
  addEvent("manual_tag", `手動新增 Tag: ${mac}`);
  showToast(`已新增手動 Tag: ${mac}`, "success");

  // 如果已連線，立即加入追蹤
  if (apiKey && allTags.length > 0) {
    const existingMacs = new Set(allTags.map(t => t.mac));
    if (!existingMacs.has(mac)) {
      allTags.push({ mac, manual: true });
    }
    populateHistoryCheckboxes();
    fetchLatest();
  }
}

function removeManualTag(mac) {
  manualTags = manualTags.filter(m => m !== mac);
  localStorage.setItem("utfind_manual_tags", JSON.stringify(manualTags));
  renderManualTagList();
  addEvent("manual_tag", `移除手動 Tag: ${mac}`);
  showToast(`已移除手動 Tag: ${mac}`, "info");
}

function renderManualTagList() {
  const container = document.getElementById("manual-tag-list");
  if (!container) return;
  if (manualTags.length === 0) {
    container.innerHTML = '<div class="empty-state">尚未新增手動 Tag</div>';
    return;
  }
  container.innerHTML = manualTags.map(mac => {
    const alias = tagAliases[mac] || "";
    return `<div class="geofence-item">
      <div>
        <strong>${mac}</strong>
        ${alias ? `<span style="color:var(--text-muted);margin-left:6px;">(${alias})</span>` : ""}
        <span style="font-size:10px;color:var(--accent);margin-left:4px;">手動</span>
      </div>
      <button class="btn-ghost-sm" onclick="removeManualTag('${mac}')">移除</button>
    </div>`;
  }).join("");
}

// ========== 連線 ==========
async function connect() {
  const input = document.getElementById("api-key");
  const status = document.getElementById("key-status");
  const key = input.value.trim();
  if (!key) { status.className = "status error"; status.textContent = "請輸入 API 金鑰"; return; }

  apiKey = key;
  status.className = "status info";
  status.innerHTML = '<span class="spinner"></span>連線中...';

  // 顯示骨架屏
  showSkeleton(true);

  try {
    allTags = await apiCall("all", {});
    if (!Array.isArray(allTags)) allTags = [];

    // 合併手動 Tag
    mergeManualTags();

    if (allTags.length === 0) {
      status.className = "status error"; status.textContent = "此金鑰下沒有任何 Tag";
      showSkeleton(false);
      return;
    }

    status.className = "status success";
    const manualCount = manualTags.length;
    status.textContent = `已取得 ${allTags.length} 個 Tag${manualCount > 0 ? `（含 ${manualCount} 個手動）` : ""}，正在取得位置...`;

    renderPlanInfo(key, allTags);
    document.getElementById("plan-section").style.display = "block";
    showSkeleton(false);
    document.getElementById("kpi-grid").style.display = "grid";

    populateHistoryCheckboxes();
    setQuickRange(1, document.querySelector(".btn-chip.active"));
    renderGeofenceList();
    drawAllGeofences();

    addEvent("connect", `已連線至 API，共 ${allTags.length} 個 Tag`);
    document.getElementById("share-section").style.display = "block";
    populateShareSelect();

    // 等待冷卻後再呼叫 /latest（/all 和 /latest 共用 30 秒冷卻）
    await fetchLatest();
    startAutoRefresh();
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
    showSkeleton(false);
    renderPlanError(err.message);
  }
}

// ========== 模擬溫溼度（API 尚未提供，先用假資料） ==========
function injectFakeSensorData(data) {
  data.forEach((tag) => {
    // 溫度：大部分在 2~8 度之間，偶爾超出範圍模擬異常
    const base = TEMP_MIN + Math.random() * (TEMP_MAX - TEMP_MIN);
    const drift = (Math.random() < 0.15) ? (Math.random() < 0.5 ? -2 : 2) : 0; // 15% 機率超標
    tag.temperature = parseFloat((base + drift).toFixed(1));
    // 濕度：40%~80%
    tag.humidity = parseFloat((40 + Math.random() * 40).toFixed(1));
  });
}

// ========== 取得最新定位 ==========
async function fetchLatest() {
  const macs = allTags.map((t) => t.mac);
  try {
    const result = await apiCall("latest", { macs });
    latestData = Array.isArray(result) ? result : [];
    injectFakeSensorData(latestData);
    renderTagList();
    updateMarkers();
    updateDashboard();
    checkAlerts();
    checkGeofenceAlerts();
    cacheLatestData();
    evaluateAlertRules();
    const status = document.getElementById("key-status");
    if (status) {
      status.className = "status success";
      status.textContent = `已連線，共 ${allTags.length} 個 Tag · 上次更新 ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    console.error("fetchLatest error:", err);
  }
}

// ========== 儀表板 ==========
function updateDashboard() {
  const total = latestData.length;
  const sos = latestData.filter((t) => t.status === "sos").length;
  const lowBat = latestData.filter((t) => t.lastBatteryLevel != null && t.lastBatteryLevel <= 20).length;
  const tempAlert = latestData.filter((t) => t.temperature != null && (t.temperature < TEMP_MIN || t.temperature > TEMP_MAX)).length;
  const online = latestData.filter((t) => {
    if (!t.lastRequestDate) return false;
    return (Date.now() - new Date(t.lastRequestDate).getTime()) < 3600000;
  }).length;

  animateValue("dash-total", total);
  animateValue("dash-sos", sos);
  animateValue("dash-lowbat", lowBat);
  animateValue("dash-online", online);
  animateValue("dash-temp", tempAlert);

  // 記錄 sparkline 資料
  latestData.forEach((tag) => {
    if (!tempHistory[tag.mac]) tempHistory[tag.mac] = [];
    if (!batHistory[tag.mac]) batHistory[tag.mac] = [];
    if (tag.temperature != null) tempHistory[tag.mac].push(tag.temperature);
    if (tag.lastBatteryLevel != null) batHistory[tag.mac].push(tag.lastBatteryLevel);
    // 保留最近 20 筆
    if (tempHistory[tag.mac].length > 20) tempHistory[tag.mac].shift();
    if (batHistory[tag.mac].length > 20) batHistory[tag.mac].shift();
  });
}

// ========== KPI 動畫 ==========
function animateValue(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const diff = target - current;
  const steps = Math.min(Math.abs(diff), 20);
  const stepTime = Math.max(20, Math.floor(400 / steps));
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const val = Math.round(current + (diff * step / steps));
    el.textContent = val;
    if (step >= steps) { el.textContent = target; clearInterval(timer); }
  }, stepTime);
}

// ========== 骨架屏 ==========
function showSkeleton(show) {
  const skel = document.getElementById("kpi-skeleton");
  if (skel) skel.style.display = show ? "grid" : "none";
}

// ========== 通知 ==========
function checkAlerts() {
  latestData.forEach((tag) => {
    const alias = tagAliases[tag.mac] || tag.mac;
    if (tag.status === "sos" && !lastNotifiedSos.has(tag.mac)) {
      lastNotifiedSos.add(tag.mac);
      showToast(`🚨 ${alias} 發出 SOS 求救！`, "danger");
      playAlertSound(800, 3);
    }
    if (tag.lastBatteryLevel != null && tag.lastBatteryLevel <= 20 && !lastNotifiedLowBat.has(tag.mac)) {
      lastNotifiedLowBat.add(tag.mac);
      showToast(`🔋 ${alias} 電量不足 (${tag.lastBatteryLevel}%)`, "warning");
    }
    // 溫度警示
    if (tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX) && !lastNotifiedTemp.has(tag.mac)) {
      lastNotifiedTemp.add(tag.mac);
      const dir = tag.temperature < TEMP_MIN ? "過低" : "過高";
      showToast(`🌡️ ${alias} 溫度${dir}！(${tag.temperature}°C，範圍 ${TEMP_MIN}~${TEMP_MAX}°C)`, "danger");
      playAlertSound(600, 2);
    }
    if (tag.status !== "sos") lastNotifiedSos.delete(tag.mac);
    if (tag.lastBatteryLevel > 20) lastNotifiedLowBat.delete(tag.mac);
    if (tag.temperature != null && tag.temperature >= TEMP_MIN && tag.temperature <= TEMP_MAX) lastNotifiedTemp.delete(tag.mac);
  });
}

function showToast(message, type = "success", duration = 5000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function playAlertSound(freq, times) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.25;
    }
  } catch (e) { /* audio not supported */ }
}

// ========== 自動刷新 ==========
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshCountdown = AUTO_REFRESH_INTERVAL;
  updateRefreshBadge();
  autoRefreshTimer = setInterval(async () => {
    autoRefreshCountdown--;
    updateRefreshBadge();
    if (autoRefreshCountdown <= 0) {
      autoRefreshCountdown = AUTO_REFRESH_INTERVAL;
      try { await fetchLatest(); } catch (e) { console.error(e); }
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  const badge = document.getElementById("auto-refresh-badge");
  if (badge) badge.style.display = "none";
}

function updateRefreshBadge() {
  const badge = document.getElementById("auto-refresh-badge");
  if (badge) { badge.style.display = "inline-block"; badge.textContent = `${autoRefreshCountdown}s`; }
}

async function refreshAll() {
  const btn = document.querySelector("#tags-section .btn-icon");
  if (btn) btn.style.animation = "spin 0.6s linear infinite";
  try {
    // 不重新呼叫 /all（Tag 清單很少變動），只刷新位置
    await fetchLatest();
    startAutoRefresh();
  } catch (e) { console.error(e); }
  if (btn) btn.style.animation = "";
}

// ========== 篩選 ==========
function filterTags(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll("#filter-bar .btn-chip").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderTagList();
}

function getFilteredData() {
  if (currentFilter === "all") return latestData;
  if (currentFilter === "sos") return latestData.filter((t) => t.status === "sos");
  if (currentFilter === "lowbat") return latestData.filter((t) => t.lastBatteryLevel != null && t.lastBatteryLevel <= 20);
  if (currentFilter === "normal") return latestData.filter((t) => t.status !== "sos");
  if (currentFilter === "tempalert") return latestData.filter((t) => t.temperature != null && (t.temperature < TEMP_MIN || t.temperature > TEMP_MAX));
  return latestData;
}

// ========== 渲染 Tag 清單 ==========
function renderTagList() {
  const container = document.getElementById("tag-list");
  let filtered = getFilteredData();

  // 搜尋過濾
  const searchEl = document.getElementById("tag-search");
  if (searchEl && searchEl.value.trim()) {
    const q = searchEl.value.trim().toLowerCase();
    filtered = filtered.filter((t) => {
      const alias = (tagAliases[t.mac] || "").toLowerCase();
      return t.mac.toLowerCase().includes(q) || alias.includes(q);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">無符合條件的 Tag</div>';
    return;
  }

  container.innerHTML = filtered.map((tag) => {
    const bat = tag.lastBatteryLevel;
    const batClass = bat == null ? "mid" : bat > 50 ? "high" : bat > 20 ? "mid" : "low";
    const batText = bat == null ? "--" : `${bat}%`;
    const timeAgo = relativeTime(tag.lastRequestDate);
    const statusClass = tag.status || "normal";
    const alias = tagAliases[tag.mac] || "設定名稱";
    const tempAlert = tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX);
    let cardClass = "tag-card";
    if (statusClass === "sos") cardClass += " sos-card";
    if (tempAlert) cardClass += " temp-alert-card";

    const tempClass = tempAlert ? "sensor-alert" : "sensor-ok";
    const tempText = tag.temperature != null ? `${tag.temperature}°C` : "--";
    const humText = tag.humidity != null ? `${tag.humidity}%` : "--";

    return `
    <div class="${cardClass}" onclick="focusTag('${tag.mac}')">
      <div class="tag-name-row">
        <span class="mac">${tag.mac}</span>
        <span class="tag-alias" onclick="event.stopPropagation();renameTag('${tag.mac}')">${alias}</span>
      </div>
      <div class="tag-meta">
        <span class="tag-status ${statusClass}">
          <span class="dot"></span>
          ${statusClass === "sos" ? "SOS" : "正常"}
        </span>
        <span class="battery">
          <span class="battery-bar"><span class="battery-fill ${batClass}" style="width:${bat ?? 50}%"></span></span>
          ${batText}
        </span>
      </div>
      <div class="tag-sensor">
        <span class="${tempClass}">🌡 ${tempText}</span>
        <span class="sensor-ok">💧 ${humText}</span>
      </div>
      <div class="tag-meta" style="margin-top:3px;">
        <span class="tag-time-ago">${timeAgo}</span>
        <span>${tag.lastLatitude?.toFixed(5)}, ${tag.lastLongitude?.toFixed(5)}</span>
      </div>
    </div>`;
  }).join("");
}

// ========== Tag 命名 ==========
function renameTag(mac) {
  const name = prompt(`為 ${mac} 設定名稱：`, tagAliases[mac] || "");
  if (name === null) return;
  if (name.trim()) tagAliases[mac] = name.trim();
  else delete tagAliases[mac];
  localStorage.setItem("utfind_aliases", JSON.stringify(tagAliases));
  renderTagList();
  populateHistoryCheckboxes();
}

// ========== 更新地圖 Markers ==========
function updateMarkers() {
  Object.values(markers).forEach((m) => map.removeLayer(m));
  markers = {};
  const bounds = [];

  latestData.forEach((tag) => {
    if (tag.lastLatitude == null || tag.lastLongitude == null) return;
    const marker = L.marker([tag.lastLatitude, tag.lastLongitude], { icon: createIcon(tag.status) })
      .addTo(map).bindPopup(createPopupContent(tag));
    markers[tag.mac] = marker;
    bounds.push([tag.lastLatitude, tag.lastLongitude]);
  });

  if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
}

function createPopupContent(tag) {
  const bat = tag.lastBatteryLevel != null ? `${tag.lastBatteryLevel}%` : "--";
  const alias = tagAliases[tag.mac] ? `<p style="font-weight:600;margin-bottom:2px;">${tagAliases[tag.mac]}</p>` : "";
  const status = tag.status === "sos" ? '<span style="color:#ef4444;font-weight:700;">SOS</span>' : '<span style="color:#22c55e;">正常</span>';
  const temp = tag.temperature != null ? `${tag.temperature}°C` : "--";
  const hum = tag.humidity != null ? `${tag.humidity}%` : "--";
  const tempAlert = tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX);
  const tempStyle = tempAlert ? 'color:#ef4444;font-weight:700;' : '';

  return `<div class="popup-content">
    ${alias}<h3>${tag.mac}</h3>
    <p>狀態：${status}</p><p>電量：${bat}</p>
    <p style="${tempStyle}">溫度：${temp}${tempAlert ? " ⚠️" : ""}</p>
    <p>濕度：${hum}</p>
    <p>經緯度：${tag.lastLatitude?.toFixed(6)}, ${tag.lastLongitude?.toFixed(6)}</p>
    <p>時間：${formatTime(tag.lastRequestDate)}</p>
    <p style="color:var(--text-faint);font-size:11px;">${relativeTime(tag.lastRequestDate)}</p>
  </div>`;
}

function focusTag(mac) {
  const m = markers[mac];
  if (m) { map.setView(m.getLatLng(), 17, { animate: true }); m.openPopup(); }
  showTagDetail(mac);
}

function centerAllTags() {
  const bounds = Object.values(markers).map((m) => [m.getLatLng().lat, m.getLatLng().lng]);
  if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

// ========== 面板切換 ==========
function switchPanel(name) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const panel = document.getElementById(`panel-${name}`);
  const nav = document.getElementById(`nav-${name}`);
  if (panel) panel.classList.add("active");
  if (nav) nav.classList.add("active");
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle("section-collapsed");
}

// ========== 深色模式 ==========
function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("utfind_theme", isDark ? "light" : "dark");
}

// 初始化主題
(function initTheme() {
  const saved = localStorage.getItem("utfind_theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
})();

// ========== 歷史軌跡（多 Tag 比對） ==========
function populateHistoryCheckboxes() {
  const container = document.getElementById("history-mac-checkboxes");
  container.innerHTML = allTags.map((t, i) => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    const color = TRACK_COLORS[i % TRACK_COLORS.length];
    return `<label class="mac-checkbox-item">
      <input type="checkbox" value="${t.mac}" ${i === 0 ? "checked" : ""} />
      <span class="mac-color-dot" style="background:${color};"></span>
      ${t.mac}${alias}
    </label>`;
  }).join("");
}

function getSelectedMacs() {
  return Array.from(document.querySelectorAll("#history-mac-checkboxes input:checked")).map((cb) => cb.value);
}

function setQuickRange(hours, btn) {
  const now = new Date();
  const start = new Date(now.getTime() - hours * 3600000);
  document.getElementById("history-end").value = toLocalISOString(now);
  document.getElementById("history-start").value = toLocalISOString(start);
  document.querySelectorAll(".quick-range .btn-chip").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

async function queryHistory() {
  const macs = getSelectedMacs();
  const startStr = document.getElementById("history-start").value;
  const endStr = document.getElementById("history-end").value;
  const status = document.getElementById("history-status");

  if (macs.length === 0 || !startStr || !endStr) {
    status.className = "status error"; status.textContent = "請選擇 Tag 並填寫時間"; return;
  }

  const startTime = new Date(startStr).getTime();
  const endTime = new Date(endStr).getTime();
  if (startTime >= endTime) {
    status.className = "status error"; status.textContent = "開始時間必須早於結束時間"; return;
  }

  // 暫停自動刷新，避免佔用 API 額度
  stopAutoRefresh();

  status.className = "status info";
  status.innerHTML = '<span class="spinner"></span>查詢中（已暫停自動刷新）...';
  clearHistory();
  historyRawData = [];

  let totalPoints = 0;
  for (let i = 0; i < macs.length; i++) {
    const mac = macs[i];
    const color = TRACK_COLORS[i % TRACK_COLORS.length];

    try {
      const result = await apiCall("history", { mac, startTime, endTime });
      const tagResult = Array.isArray(result) ? result[0] : null;
      if (!tagResult || !tagResult.data || tagResult.data.length === 0) continue;

      historyRawData.push({ mac, data: tagResult.data });
      drawHistory(tagResult.data, color, mac);
      totalPoints += tagResult.data.length;
    } catch (err) {
      console.error(`history error for ${mac}:`, err);
      status.innerHTML = `<span class="spinner"></span>查詢 ${mac} 失敗，繼續下一個...`;
    }
  }

  if (totalPoints === 0) {
    status.className = "status error"; status.textContent = "該時間範圍內無紀錄";
    document.getElementById("history-stats").style.display = "none";
    return;
  }

  // 用第一個 Tag 做回放和統計
  if (historyRawData.length > 0) {
    showHistoryStats(historyRawData[0].data);
    setupPlayback(historyRawData[0].data);
  }

  status.className = "status success";
  status.textContent = `共 ${totalPoints} 筆紀錄 (${macs.length} 個 Tag)`;

  // 查詢完成，恢復自動刷新
  startAutoRefresh();
}

function drawHistory(data, color, mac) {
  const latlngs = [];
  const alias = tagAliases[mac] || mac;

  data.forEach((point, i) => {
    if (point.lastLatitude == null || point.lastLongitude == null) return;
    const lat = point.lastLatitude;
    const lng = point.lastLongitude;
    latlngs.push([lat, lng]);

    const isStart = i === 0;
    const isEnd = i === data.length - 1;
    let icon;
    if (isStart) icon = createStartEndIcon("start");
    else if (isEnd) icon = createStartEndIcon("end");
    else icon = createHistoryIcon(i, data.length, color);

    const label = isStart ? "起點" : isEnd ? "終點" : `#${i + 1}`;
    const marker = L.marker([lat, lng], { icon }).addTo(map)
      .bindPopup(`<div class="popup-content">
        <p><b>${alias} — ${label}</b></p>
        <p>時間：${formatTime(point.lastRequestDate)}</p>
        <p>經緯度：${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
        <p>電量：${point.lastBatteryLevel ?? "--"}%</p>
      </div>`);
    historyMarkers.push(marker);
  });

  if (latlngs.length > 1) {
    const line = L.polyline(latlngs, { color, weight: 3, opacity: 0.7, dashArray: "8 6" }).addTo(map);
    historyLines.push(line);
  }

  if (latlngs.length > 0) map.fitBounds(latlngs, { padding: [60, 60], maxZoom: 16 });
}

function showHistoryStats(data) {
  const statsEl = document.getElementById("history-stats");
  if (data.length < 2) { statsEl.style.display = "none"; return; }

  let totalDist = 0;
  for (let i = 1; i < data.length; i++) {
    const p1 = data[i - 1], p2 = data[i];
    if (p1.lastLatitude != null && p2.lastLatitude != null)
      totalDist += haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude);
  }

  const firstTime = new Date(data[0].lastRequestDate);
  const lastTime = new Date(data[data.length - 1].lastRequestDate);
  const distText = totalDist < 1 ? `${Math.round(totalDist * 1000)} m` : `${totalDist.toFixed(2)} km`;

  statsEl.style.display = "block";
  statsEl.innerHTML = `
    <div class="stat-row"><span class="stat-label">總距離</span><span class="stat-value">${distText}</span></div>
    <div class="stat-row"><span class="stat-label">時間跨度</span><span class="stat-value">${formatDuration(lastTime - firstTime)}</span></div>
    <div class="stat-row"><span class="stat-label">紀錄筆數</span><span class="stat-value">${data.length}</span></div>
    <div class="stat-row"><span class="stat-label">起點</span><span class="stat-value">${formatTime(data[0].lastRequestDate)}</span></div>
    <div class="stat-row"><span class="stat-label">終點</span><span class="stat-value">${formatTime(data[data.length - 1].lastRequestDate)}</span></div>
  `;
}

function clearHistory() {
  historyLines.forEach((l) => map.removeLayer(l));
  historyLines = [];
  if (historyLine) { map.removeLayer(historyLine); historyLine = null; }
  historyMarkers.forEach((m) => map.removeLayer(m));
  historyMarkers = [];
  if (playbackMarker) { map.removeLayer(playbackMarker); playbackMarker = null; }
  stopPlayback();
  historyRawData = [];

  document.getElementById("history-status").textContent = "";
  document.getElementById("history-stats").style.display = "none";
  document.getElementById("playback-controls").style.display = "none";
}

// ========== 軌跡回放 ==========
function setupPlayback(data) {
  playbackData = data.filter((p) => p.lastLatitude != null);
  if (playbackData.length < 2) return;
  playbackIndex = 0;
  document.getElementById("playback-controls").style.display = "flex";
  document.getElementById("playback-slider").max = playbackData.length - 1;
  document.getElementById("playback-slider").value = 0;
  updatePlaybackTime();
}

function togglePlayback() {
  if (playbackTimer) stopPlayback();
  else startPlayback();
}

function startPlayback() {
  if (playbackData.length < 2) return;
  document.getElementById("btn-play").innerHTML = "&#9646;&#9646;";
  playbackTimer = setInterval(() => {
    if (playbackIndex >= playbackData.length - 1) { stopPlayback(); return; }
    playbackIndex++;
    updatePlaybackPosition();
  }, playbackSpeed);
}

function stopPlayback() {
  if (playbackTimer) { clearInterval(playbackTimer); playbackTimer = null; }
  document.getElementById("btn-play").innerHTML = "&#9654;";
}

function seekPlayback(val) {
  playbackIndex = parseInt(val);
  updatePlaybackPosition();
}

function setPlaybackSpeed(val) {
  playbackSpeed = parseInt(val);
  if (playbackTimer) { stopPlayback(); startPlayback(); }
}

function updatePlaybackPosition() {
  const p = playbackData[playbackIndex];
  const latlng = [p.lastLatitude, p.lastLongitude];

  if (!playbackMarker) {
    playbackMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
    }).addTo(map);
  } else {
    playbackMarker.setLatLng(latlng);
  }

  map.panTo(latlng);
  document.getElementById("playback-slider").value = playbackIndex;
  updatePlaybackTime();
}

function updatePlaybackTime() {
  if (playbackData.length === 0) return;
  const p = playbackData[playbackIndex] || playbackData[0];
  document.getElementById("playback-time").textContent = formatTime(p.lastRequestDate);
}

// ========== 匯出 ==========
function exportHistory(format) {
  if (historyRawData.length === 0) {
    showToast("請先查詢歷史軌跡", "warning"); return;
  }

  if (format === "json") {
    downloadFile(JSON.stringify(historyRawData, null, 2), "history.json", "application/json");
  } else {
    let csv = "mac,latitude,longitude,battery,time,status\n";
    historyRawData.forEach(({ mac, data }) => {
      data.forEach((p) => {
        csv += `${mac},${p.lastLatitude},${p.lastLongitude},${p.lastBatteryLevel ?? ""},${p.lastRequestDate},${p.status}\n`;
      });
    });
    downloadFile(csv, "history.csv", "text/csv");
  }
  showToast(`已匯出 ${format.toUpperCase()}`, "success");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ========== 距離測量 ==========
function toggleMeasure() {
  measureMode = !measureMode;
  document.getElementById("btn-measure").classList.toggle("active", measureMode);
  if (measureMode) {
    geocodeMode = false;
    document.getElementById("btn-geocode").classList.remove("active");
    map.getContainer().style.cursor = "crosshair";
  } else {
    map.getContainer().style.cursor = "";
  }
}

function addMeasurePoint(latlng) {
  measurePoints.push(latlng);
  const marker = L.circleMarker(latlng, { radius: 5, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }).addTo(map);
  measureMarkers.push(marker);

  if (measurePoints.length > 1) {
    if (measureLine) map.removeLayer(measureLine);
    measureLine = L.polyline(measurePoints, { color: "#ef4444", weight: 2, dashArray: "6 4" }).addTo(map);
  }

  updateMeasureInfo();
}

function updateMeasureInfo() {
  const infoEl = document.getElementById("measure-info");
  if (measurePoints.length < 2) {
    infoEl.style.display = measurePoints.length > 0 ? "flex" : "none";
    document.getElementById("measure-text").textContent = "點擊地圖新增測量點";
    return;
  }

  let total = 0;
  for (let i = 1; i < measurePoints.length; i++) {
    total += haversine(measurePoints[i - 1].lat, measurePoints[i - 1].lng, measurePoints[i].lat, measurePoints[i].lng);
  }

  const text = total < 1 ? `${Math.round(total * 1000)} 公尺` : `${total.toFixed(2)} 公里`;
  document.getElementById("measure-text").textContent = `距離: ${text}`;
  infoEl.style.display = "flex";
}

function clearMeasure() {
  measurePoints = [];
  measureMarkers.forEach((m) => map.removeLayer(m));
  measureMarkers = [];
  if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
  document.getElementById("measure-info").style.display = "none";
  measureMode = false;
  document.getElementById("btn-measure").classList.remove("active");
  map.getContainer().style.cursor = "";
}

// ========== 地址反查 ==========
function toggleClickGeocode() {
  geocodeMode = !geocodeMode;
  document.getElementById("btn-geocode").classList.toggle("active", geocodeMode);
  if (geocodeMode) {
    measureMode = false;
    document.getElementById("btn-measure").classList.remove("active");
    map.getContainer().style.cursor = "crosshair";
  } else {
    map.getContainer().style.cursor = "";
    if (geocodeMarker) { map.removeLayer(geocodeMarker); geocodeMarker = null; }
  }
}

async function reverseGeocode(latlng) {
  if (geocodeMarker) map.removeLayer(geocodeMarker);

  geocodeMarker = L.marker(latlng).addTo(map)
    .bindPopup('<span class="spinner"></span>查詢地址中...').openPopup();

  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&accept-language=zh-TW`);
    const data = await resp.json();
    const addr = data.display_name || "無法取得地址";
    geocodeMarker.setPopupContent(`<div class="popup-content">
      <p><b>地址</b></p>
      <p>${addr}</p>
      <p style="color:var(--text-faint);font-size:11px;">${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</p>
    </div>`);
  } catch (e) {
    geocodeMarker.setPopupContent("地址查詢失敗");
  }
}

// ========== 地理圍欄 ==========
function startGeofencePick() {
  geofencePickMode = true;
  geofencePickLatLng = null;
  document.getElementById("btn-geofence-pick").textContent = "請點擊地圖...";
  map.getContainer().style.cursor = "crosshair";
}

function drawTempGeofence() {
  if (geofenceTempCircle) map.removeLayer(geofenceTempCircle);
  const radius = parseInt(document.getElementById("geofence-radius").value) || 500;
  if (geofencePickLatLng) {
    geofenceTempCircle = L.circle(geofencePickLatLng, {
      radius, color: "#8b5cf6", fillColor: "#8b5cf6", fillOpacity: 0.15, weight: 2, dashArray: "6 4",
    }).addTo(map);
  }
  map.getContainer().style.cursor = "";
}

// 半徑變更時更新預覽
document.addEventListener("input", (e) => {
  if (e.target.id === "geofence-radius" && geofencePickLatLng) drawTempGeofence();
});

function saveGeofence() {
  if (!geofencePickLatLng) { showToast("請先選取位置", "warning"); return; }
  const name = document.getElementById("geofence-name").value.trim() || "未命名圍欄";
  const radius = parseInt(document.getElementById("geofence-radius").value) || 500;
  const gf = {
    id: Date.now().toString(),
    name,
    lat: geofencePickLatLng.lat,
    lng: geofencePickLatLng.lng,
    radius,
  };
  geofences.push(gf);
  localStorage.setItem("utfind_geofences", JSON.stringify(geofences));
  renderGeofenceList();
  drawAllGeofences();

  // 清除暫時狀態
  if (geofenceTempCircle) { map.removeLayer(geofenceTempCircle); geofenceTempCircle = null; }
  geofencePickLatLng = null;
  document.getElementById("btn-geofence-pick").textContent = "選取位置";
  document.getElementById("geofence-name").value = "";
  showToast(`已新增圍欄「${name}」`, "success");
}

function deleteGeofence(id) {
  geofences = geofences.filter((g) => g.id !== id);
  localStorage.setItem("utfind_geofences", JSON.stringify(geofences));
  renderGeofenceList();
  drawAllGeofences();
}

function renderGeofenceList() {
  const container = document.getElementById("geofence-list");
  if (geofences.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML = geofences.map((gf) => `
    <div class="geofence-item">
      <div>
        <div class="gf-name">${gf.name}</div>
        <div class="gf-radius">${gf.radius}m · ${gf.lat.toFixed(4)}, ${gf.lng.toFixed(4)}</div>
      </div>
      <div class="gf-actions">
        <button class="gf-btn" onclick="map.setView([${gf.lat},${gf.lng}],16)">定位</button>
        <button class="gf-btn gf-del" onclick="deleteGeofence('${gf.id}')">刪除</button>
      </div>
    </div>
  `).join("");
}

function drawAllGeofences() {
  Object.values(geofenceCircles).forEach((c) => map.removeLayer(c));
  geofenceCircles = {};
  geofences.forEach((gf) => {
    geofenceCircles[gf.id] = L.circle([gf.lat, gf.lng], {
      radius: gf.radius, color: "#8b5cf6", fillColor: "#8b5cf6", fillOpacity: 0.08, weight: 2,
    }).addTo(map).bindPopup(`<b>${gf.name}</b><br>半徑 ${gf.radius}m`);
  });
}

function checkGeofenceAlerts() {
  if (geofences.length === 0 || latestData.length === 0) return;

  latestData.forEach((tag) => {
    if (tag.lastLatitude == null) return;
    const alias = tagAliases[tag.mac] || tag.mac;

    geofences.forEach((gf) => {
      const dist = haversine(tag.lastLatitude, tag.lastLongitude, gf.lat, gf.lng) * 1000;
      const inside = dist <= gf.radius;
      const key = `${tag.mac}_${gf.id}`;

      if (!inside && !geofenceAlertSent.has(key)) {
        geofenceAlertSent.add(key);
        showToast(`📍 ${alias} 離開圍欄「${gf.name}」`, "warning");
      }
      if (inside) geofenceAlertSent.delete(key);
    });
  });
}
const geofenceAlertSent = new Set();

// ========== 工具函式 ==========
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function formatTime(isoStr) {
  if (!isoStr) return "--";
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalISOString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeTime(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "剛剛";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘`;
  const hr = Math.floor(min / 60);
  const rm = min % 60;
  if (hr < 24) return rm > 0 ? `${hr}h ${rm}m` : `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d ${hr % 24}h`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========== 方案資訊 ==========
function detectPlan(tags) {
  const c = tags.length;
  if (c <= 100) return "Basic";
  if (c <= 500) return "Professional";
  return "Enterprise";
}

function renderPlanInfo(key, tags) {
  if (!Array.isArray(tags)) return;
  const plan = detectPlan(tags);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.Basic;
  const tagsHtml = tags.map((t) => `<span class="plan-tag-mac">${t.mac}</span>`).join("");
  document.getElementById("plan-content").innerHTML = `
    <div class="plan-row"><span class="plan-label">方案</span><span class="plan-value plan-badge">${plan}</span></div>
    <div class="plan-row"><span class="plan-label">金鑰</span><span class="plan-value mono">${key}</span></div>
    <div class="plan-row"><span class="plan-label">API 頻率</span><span class="plan-value">${limits.rateLimit ? limits.rateLimit + "s" : "自訂"}</span></div>
    <div class="plan-row"><span class="plan-label">最多 Tags</span><span class="plan-value">${limits.maxTags || "自訂"}</span></div>
    <div class="plan-row" style="align-items:flex-start;"><span class="plan-label">Tags (${tags.length})</span><span class="plan-value mono" style="font-size:11px;text-align:right;">${tagsHtml}</span></div>
  `;
}

function renderPlanError(message) {
  document.getElementById("plan-section").style.display = "block";
  document.getElementById("plan-content").innerHTML = `<div class="plan-row"><span class="plan-label">狀態</span><span class="plan-value" style="color:var(--danger);">${message}</span></div>`;
}

// ========== Tag 詳情面板 ==========
function showTagDetail(mac) {
  const tag = latestData.find((t) => t.mac === mac);
  if (!tag) return;

  const alias = tagAliases[mac] || "";
  const statusClass = tag.status || "normal";
  const statusText = statusClass === "sos" ? "SOS" : "正常";
  const bat = tag.lastBatteryLevel != null ? tag.lastBatteryLevel : "--";
  const temp = tag.temperature != null ? tag.temperature : "--";
  const hum = tag.humidity != null ? tag.humidity : "--";
  const tempAlert = tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX);

  const tempSpark = generateSparklineSVG(tempHistory[mac] || [], TEMP_MIN, TEMP_MAX, tempAlert ? "#ef4444" : "#a855f7");
  const batSpark = generateSparklineSVG(batHistory[mac] || [], 0, 100, "#3b82f6");

  document.getElementById("detail-content").innerHTML = `
    <div class="detail-header">
      <div class="detail-mac">${mac}</div>
      ${alias ? `<div class="detail-alias">${alias}</div>` : ""}
      <div class="detail-status-badge ${statusClass}">${statusText}</div>
    </div>
    <div class="detail-grid">
      <div class="detail-stat">
        <div class="detail-stat-value" style="color:${tempAlert ? "var(--danger)" : "var(--purple)"}">${temp}${typeof temp === "number" ? "°C" : ""}</div>
        <div class="detail-stat-label">溫度</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value" style="color:var(--cyan)">${hum}${typeof hum === "number" ? "%" : ""}</div>
        <div class="detail-stat-label">濕度</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value" style="color:${bat <= 20 ? "var(--danger)" : "var(--warning)"}">${bat}${typeof bat === "number" ? "%" : ""}</div>
        <div class="detail-stat-label">電量</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value" style="font-size:14px;color:var(--text-secondary)">${relativeTime(tag.lastRequestDate)}</div>
        <div class="detail-stat-label">更新</div>
      </div>
    </div>
    <div class="sparkline-container">
      <div class="sparkline-title">溫度趨勢</div>
      ${tempSpark}
    </div>
    <div class="sparkline-container">
      <div class="sparkline-title">電量趨勢</div>
      ${batSpark}
    </div>
    <div class="detail-location">
      <p><b>位置</b></p>
      <p>${tag.lastLatitude?.toFixed(6)}, ${tag.lastLongitude?.toFixed(6)}</p>
      <p>${formatTime(tag.lastRequestDate)}</p>
    </div>
  `;

  switchPanel("detail");
}

function generateSparklineSVG(data, min, max, color) {
  if (data.length < 2) return '<div style="height:48px;display:flex;align-items:center;justify-content:center;color:var(--text-faint);font-size:11px;">資料不足</div>';

  const w = 320, h = 48, pad = 4;
  const range = (max - min) || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  return `<svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${points.join(" ")}" />
    <circle cx="${points[points.length - 1].split(",")[0]}" cy="${points[points.length - 1].split(",")[1]}" r="3" fill="${color}" />
  </svg>`;
}

// ========== 熱力圖 ==========
function toggleHeatmap() {
  heatmapOn = !heatmapOn;
  document.getElementById("btn-heatmap").classList.toggle("active", heatmapOn);

  if (heatmapOn) {
    const points = latestData
      .filter((t) => t.lastLatitude != null)
      .map((t) => [t.lastLatitude, t.lastLongitude, 1]);
    if (points.length > 0) {
      heatmapLayer = L.heatLayer(points, { radius: 30, blur: 20, maxZoom: 17 }).addTo(map);
    }
  } else {
    if (heatmapLayer) { map.removeLayer(heatmapLayer); heatmapLayer = null; }
  }
}

// ========== Marker 群集 ==========
function toggleClustering() {
  clusterOn = !clusterOn;
  document.getElementById("btn-cluster").classList.toggle("active", clusterOn);

  if (clusterOn) {
    clusterGroup = L.markerClusterGroup();
    Object.values(markers).forEach((m) => {
      map.removeLayer(m);
      clusterGroup.addLayer(m);
    });
    map.addLayer(clusterGroup);
  } else {
    if (clusterGroup) {
      map.removeLayer(clusterGroup);
      Object.values(markers).forEach((m) => m.addTo(map));
      clusterGroup = null;
    }
  }
}

// ========== 速度計算 (歷史軌跡) ==========
function calcSpeed(p1, p2) {
  if (!p1.lastRequestDate || !p2.lastRequestDate) return null;
  const dist = haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude);
  const timeDiff = (new Date(p2.lastRequestDate) - new Date(p1.lastRequestDate)) / 3600000;
  if (timeDiff <= 0) return null;
  return dist / timeDiff; // km/h
}

// ========== 事件日誌 ==========
function addEvent(type, message) {
  const icons = { connect: "🔗", sos: "🚨", lowbat: "🔋", temp: "🌡️", geofence: "📍", refresh: "🔄", info: "ℹ️" };
  const evt = {
    type,
    icon: icons[type] || "📋",
    message,
    time: new Date().toISOString(),
  };
  eventLog.unshift(evt);
  if (eventLog.length > 200) eventLog.pop();
  localStorage.setItem("utfind_events", JSON.stringify(eventLog));
  renderEventLog();
}

function renderEventLog() {
  const container = document.getElementById("event-list");
  if (!container) return;

  if (eventLog.length === 0) {
    container.innerHTML = '<div class="empty-state" data-i18n="noEvents">尚無事件</div>';
    return;
  }

  container.innerHTML = eventLog.slice(0, 50).map((evt) => `
    <div class="event-item">
      <span class="event-icon">${evt.icon}</span>
      <div class="event-body">
        <div class="event-msg">${evt.message}</div>
        <div class="event-time">${formatTime(evt.time)}</div>
      </div>
    </div>
  `).join("");
}

function clearEventLog() {
  eventLog = [];
  localStorage.removeItem("utfind_events");
  renderEventLog();
}

// ========== 分享連結 ==========
function shareTag() {
  const detailMac = document.querySelector(".detail-mac");
  if (!detailMac) return;
  const mac = detailMac.textContent;
  const tag = latestData.find((t) => t.mac === mac);
  if (!tag || tag.lastLatitude == null) { showToast("無法分享：沒有位置資料", "warning"); return; }

  const url = `https://www.google.com/maps?q=${tag.lastLatitude},${tag.lastLongitude}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast("位置連結已複製", "success"));
  } else {
    prompt("複製此連結:", url);
  }
  addEvent("info", `分享了 ${tagAliases[mac] || mac} 的位置`);
}

// ========== 列印報告 ==========
function printReport() {
  if (historyRawData.length === 0) { showToast("請先查詢歷史軌跡", "warning"); return; }

  const printWin = window.open("", "_blank");
  let html = `<!DOCTYPE html><html><head><title>UTFind 軌跡報告</title>
    <style>body{font-family:sans-serif;padding:20px;color:#333;}
    h1{color:#3b82f6;}table{width:100%;border-collapse:collapse;margin-top:16px;}
    th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left;}
    th{background:#f0f2f5;font-weight:600;}</style></head><body>
    <h1>UTFind 軌跡報告</h1>
    <p>匯出時間: ${new Date().toLocaleString()}</p>`;

  historyRawData.forEach(({ mac, data }) => {
    const alias = tagAliases[mac] || mac;
    html += `<h2>${alias} (${mac})</h2>
      <p>共 ${data.length} 筆紀錄</p>
      <table><tr><th>#</th><th>時間</th><th>緯度</th><th>經度</th><th>電量</th><th>狀態</th></tr>`;
    data.forEach((p, i) => {
      html += `<tr><td>${i + 1}</td><td>${formatTime(p.lastRequestDate)}</td>
        <td>${p.lastLatitude?.toFixed(6)}</td><td>${p.lastLongitude?.toFixed(6)}</td>
        <td>${p.lastBatteryLevel ?? "--"}%</td><td>${p.status || "normal"}</td></tr>`;
    });
    html += "</table>";
  });

  html += "</body></html>";
  printWin.document.write(html);
  printWin.document.close();
  printWin.print();
}

// ========== 通知音效開關 ==========
function toggleNotifSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById("btn-sound");
  btn.classList.toggle("sound-off", !soundEnabled);
  showToast(soundEnabled ? "通知音效已開啟" : "通知音效已關閉", "info", 2000);
}

// ========== 多語系 (i18n) ==========
const LANG = {
  zh: {
    dashboard: "總覽 Dashboard", connect: "連線", online: "在線裝置", lowbat: "低電量",
    tempAlert: "溫度異常", total: "裝置總數", planInfo: "方案資訊", devices: "裝置列表",
    all: "全部", normal: "正常", history: "歷史軌跡", selectTag: "選擇 Tag",
    start: "開始", end: "結束", queryTrack: "查詢軌跡", clear: "清除", print: "列印",
    geofence: "地理圍欄", pickLocation: "點擊地圖設定中心", pickPos: "選取位置",
    radius: "半徑 (m)", name: "名稱", saveGeofence: "儲存圍欄",
    eventLog: "事件日誌", clearAll: "清除全部", noEvents: "尚無事件",
    back: "返回", share: "分享",
  },
  en: {
    dashboard: "Dashboard", connect: "Connect", online: "Online", lowbat: "Low Battery",
    tempAlert: "Temp Alert", total: "Total", planInfo: "Plan Info", devices: "Devices",
    all: "All", normal: "Normal", history: "History", selectTag: "Select Tag",
    start: "Start", end: "End", queryTrack: "Query Track", clear: "Clear", print: "Print",
    geofence: "Geofence", pickLocation: "Click map to set center", pickPos: "Pick Position",
    radius: "Radius (m)", name: "Name", saveGeofence: "Save Geofence",
    eventLog: "Event Log", clearAll: "Clear All", noEvents: "No events",
    back: "Back", share: "Share",
  },
};

function toggleLang() {
  currentLang = currentLang === "zh" ? "en" : "zh";
  localStorage.setItem("utfind_lang", currentLang);
  applyLang();
  showToast(currentLang === "zh" ? "已切換為中文" : "Switched to English", "info", 2000);
}

function applyLang() {
  const dict = LANG[currentLang] || LANG.zh;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}

// ========== PWA ==========
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.log("SW registration failed:", e));
}

// ========== 鍵盤快捷鍵 ==========
document.addEventListener("keydown", (e) => {
  // 不攔截輸入框中的按鍵
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

  switch (e.key) {
    case "1": switchPanel("dashboard"); break;
    case "2": switchPanel("tags"); break;
    case "3": switchPanel("history"); break;
    case "4": switchPanel("geofence"); break;
    case "5": switchPanel("events"); break;
    case "6": switchPanel("reports"); break;
    case "7": switchPanel("groups"); break;
    case "8": switchPanel("settings"); break;
    case "9": switchPanel("coldchain"); break;
    case "0": switchPanel("logistics"); break;
    case "r": case "R": if (!e.ctrlKey && !e.metaKey) refreshAll(); break;
    case "f": case "F": if (!e.ctrlKey && !e.metaKey) toggleFullscreen(); break;
    case "m": case "M": if (!e.ctrlKey && !e.metaKey) toggleMeasure(); break;
  }
});

// ========== 通知增強（加入事件日誌） ==========
const _origCheckAlerts = checkAlerts;
checkAlerts = function() {
  const prevSos = new Set(lastNotifiedSos);
  const prevTemp = new Set(lastNotifiedTemp);
  const prevBat = new Set(lastNotifiedLowBat);
  _origCheckAlerts();
  // 記錄新事件
  latestData.forEach((tag) => {
    const alias = tagAliases[tag.mac] || tag.mac;
    if (tag.status === "sos" && !prevSos.has(tag.mac) && lastNotifiedSos.has(tag.mac)) {
      addEvent("sos", `${alias} 發出 SOS 求救！`);
    }
    if (tag.lastBatteryLevel != null && tag.lastBatteryLevel <= 20 && !prevBat.has(tag.mac) && lastNotifiedLowBat.has(tag.mac)) {
      addEvent("lowbat", `${alias} 電量不足 (${tag.lastBatteryLevel}%)`);
    }
    if (tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX) && !prevTemp.has(tag.mac) && lastNotifiedTemp.has(tag.mac)) {
      addEvent("temp", `${alias} 溫度異常 (${tag.temperature}°C)`);
    }
  });
};

// ========== 更新 Markers 支援群集 ==========
const _origUpdateMarkers = updateMarkers;
updateMarkers = function() {
  // 清除群集
  if (clusterGroup) { map.removeLayer(clusterGroup); clusterGroup = null; }
  clusterOn = false;
  document.getElementById("btn-cluster")?.classList.remove("active");
  // 清除熱力圖
  if (heatmapLayer) { map.removeLayer(heatmapLayer); heatmapLayer = null; }
  heatmapOn = false;
  document.getElementById("btn-heatmap")?.classList.remove("active");

  _origUpdateMarkers();
};

// ========== 歷史統計增加速度 ==========
const _origShowHistoryStats = showHistoryStats;
showHistoryStats = function(data) {
  _origShowHistoryStats(data);
  if (data.length < 2) return;

  let totalDist = 0;
  const speeds = [];
  for (let i = 1; i < data.length; i++) {
    const p1 = data[i - 1], p2 = data[i];
    if (p1.lastLatitude != null && p2.lastLatitude != null) {
      const d = haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude);
      totalDist += d;
      const s = calcSpeed(p1, p2);
      if (s != null && s < 200) speeds.push(s); // 排除不合理速度
    }
  }

  if (speeds.length > 0) {
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxSpeed = Math.max(...speeds);
    const statsEl = document.getElementById("history-stats");
    statsEl.innerHTML += `
      <div class="stat-row"><span class="stat-label">平均速度</span><span class="stat-value">${avgSpeed.toFixed(1)} km/h</span></div>
      <div class="stat-row"><span class="stat-label">最高速度</span><span class="stat-value">${maxSpeed.toFixed(1)} km/h</span></div>
    `;
  }
};

// ========== 初始化 ==========
applyLang();
renderEventLog();

// ========== 1. 路徑回放箭頭 + 速度色彩 ==========
let directionArrows = [];

function getSpeedColor(speedKmh) {
  if (speedKmh < 5) return "#22c55e";
  if (speedKmh < 20) return "#3b82f6";
  if (speedKmh < 50) return "#f59e0b";
  return "#ef4444";
}

// 增強版 drawHistory（覆蓋原有的）
const _origDrawHistory = drawHistory;
drawHistory = function(data, color, mac) {
  _origDrawHistory(data, color, mac);

  // 在路徑上加入方向箭頭和速度色彩段
  for (let i = 1; i < data.length; i++) {
    const p1 = data[i - 1], p2 = data[i];
    if (p1.lastLatitude == null || p2.lastLatitude == null) continue;

    const speed = calcSpeed(p1, p2);
    if (speed != null && speed < 200) {
      const segColor = getSpeedColor(speed);
      const seg = L.polyline(
        [[p1.lastLatitude, p1.lastLongitude], [p2.lastLatitude, p2.lastLongitude]],
        { color: segColor, weight: 4, opacity: 0.8 }
      ).addTo(map).bindPopup(`速度: ${speed.toFixed(1)} km/h`);
      historyLines.push(seg);
    }

    // 每隔幾個點加一個方向箭頭
    if (i % Math.max(1, Math.floor(data.length / 10)) === 0) {
      const midLat = (p1.lastLatitude + p2.lastLatitude) / 2;
      const midLng = (p1.lastLongitude + p2.lastLongitude) / 2;
      const angle = Math.atan2(p2.lastLongitude - p1.lastLongitude, p2.lastLatitude - p1.lastLatitude) * 180 / Math.PI;

      const arrow = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "direction-arrow",
          html: `<div style="transform:rotate(${90 - angle}deg);">➤</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);
      historyMarkers.push(arrow);
    }
  }
};

// ========== 2. 多邊形圍欄 ==========
let polygonGeofences = JSON.parse(localStorage.getItem("utfind_poly_geofences") || "[]");
let polyDrawMode = false;
let polyPoints = [];
let polyTempMarkers = [];
let polyTempLine = null;
let polyLayers = {};

function togglePolyDraw() {
  polyDrawMode = !polyDrawMode;
  if (polyDrawMode) {
    polyPoints = [];
    map.getContainer().style.cursor = "crosshair";
    showToast("點擊地圖畫出多邊形頂點，雙擊完成", "info", 4000);
  } else {
    clearPolyTemp();
    map.getContainer().style.cursor = "";
  }
}

map.on("click", function polyHandler(e) {
  if (!polyDrawMode) return;
  polyPoints.push(e.latlng);
  const m = L.circleMarker(e.latlng, { radius: 5, color: "#a855f7", fillColor: "#a855f7", fillOpacity: 1 }).addTo(map);
  polyTempMarkers.push(m);
  if (polyTempLine) map.removeLayer(polyTempLine);
  if (polyPoints.length > 1) {
    polyTempLine = L.polyline(polyPoints, { color: "#a855f7", weight: 2, dashArray: "6 4" }).addTo(map);
  }
});

map.on("dblclick", function polyFinish(e) {
  if (!polyDrawMode || polyPoints.length < 3) return;
  L.DomEvent.stopPropagation(e);
  polyDrawMode = false;
  map.getContainer().style.cursor = "";

  const name = prompt("輸入多邊形圍欄名稱：", "多邊形圍欄");
  if (!name) { clearPolyTemp(); return; }

  const gf = {
    id: Date.now().toString(),
    name,
    points: polyPoints.map(p => ({ lat: p.lat, lng: p.lng })),
  };
  polygonGeofences.push(gf);
  localStorage.setItem("utfind_poly_geofences", JSON.stringify(polygonGeofences));
  clearPolyTemp();
  drawAllPolyGeofences();
  showToast(`已新增多邊形圍欄「${name}」`, "success");
  addEvent("geofence", `新增多邊形圍欄: ${name}`);
});

function clearPolyTemp() {
  polyTempMarkers.forEach(m => map.removeLayer(m));
  polyTempMarkers = [];
  if (polyTempLine) { map.removeLayer(polyTempLine); polyTempLine = null; }
  polyPoints = [];
}

function drawAllPolyGeofences() {
  Object.values(polyLayers).forEach(l => map.removeLayer(l));
  polyLayers = {};
  polygonGeofences.forEach(gf => {
    const latlngs = gf.points.map(p => [p.lat, p.lng]);
    polyLayers[gf.id] = L.polygon(latlngs, {
      color: "#a855f7", fillColor: "#a855f7", fillOpacity: 0.08, weight: 2,
    }).addTo(map).bindPopup(`<b>${gf.name}</b><br>多邊形圍欄`);
  });
}

function deletePolyGeofence(id) {
  polygonGeofences = polygonGeofences.filter(g => g.id !== id);
  localStorage.setItem("utfind_poly_geofences", JSON.stringify(polygonGeofences));
  drawAllPolyGeofences();
}

function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  const pts = polygon.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lat, yi = pts[i].lng;
    const xj = pts[j].lat, yj = pts[j].lng;
    if ((yi > lng) !== (yj > lng) && lat < (xj - xi) * (lng - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ========== 3. 停留點分析 ==========
let dwellMarkers = [];

function analyzeDwellPoints() {
  if (historyRawData.length === 0) { showToast("請先查詢歷史軌跡", "warning"); return; }

  const minMinutes = parseInt(document.getElementById("dwell-minutes").value) || 10;
  dwellMarkers.forEach(m => map.removeLayer(m));
  dwellMarkers = [];

  const allDwells = [];

  historyRawData.forEach(({ mac, data }) => {
    const alias = tagAliases[mac] || mac;
    let dwellStart = 0;

    for (let i = 1; i < data.length; i++) {
      const p1 = data[dwellStart], p2 = data[i];
      if (p1.lastLatitude == null || p2.lastLatitude == null) { dwellStart = i; continue; }

      const dist = haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude) * 1000;

      if (dist > 50) {  // 移動超過 50m 視為離開
        const duration = (new Date(data[i - 1].lastRequestDate) - new Date(data[dwellStart].lastRequestDate)) / 60000;
        if (duration >= minMinutes) {
          allDwells.push({
            mac, alias,
            lat: p1.lastLatitude, lng: p1.lastLongitude,
            duration: Math.round(duration),
            start: data[dwellStart].lastRequestDate,
            end: data[i - 1].lastRequestDate,
          });
        }
        dwellStart = i;
      }
    }

    // 檢查最後一段
    if (data.length > 1) {
      const duration = (new Date(data[data.length - 1].lastRequestDate) - new Date(data[dwellStart].lastRequestDate)) / 60000;
      if (duration >= minMinutes && data[dwellStart].lastLatitude != null) {
        allDwells.push({
          mac, alias,
          lat: data[dwellStart].lastLatitude, lng: data[dwellStart].lastLongitude,
          duration: Math.round(duration),
          start: data[dwellStart].lastRequestDate,
          end: data[data.length - 1].lastRequestDate,
        });
      }
    }
  });

  // 在地圖上標記
  allDwells.forEach(d => {
    const marker = L.marker([d.lat, d.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="dwell-marker">${d.duration}m</div>`,
        iconSize: [40, 20], iconAnchor: [20, 10],
      }),
    }).addTo(map).bindPopup(`<div class="popup-content">
      <p><b>${d.alias} 停留</b></p>
      <p>時長: ${d.duration} 分鐘</p>
      <p>開始: ${formatTime(d.start)}</p>
      <p>結束: ${formatTime(d.end)}</p>
    </div>`);
    dwellMarkers.push(marker);
  });

  // 更新面板
  const output = document.getElementById("dwell-output");
  if (allDwells.length === 0) {
    output.innerHTML = '<div class="empty-state">無符合條件的停留點</div>';
  } else {
    output.innerHTML = allDwells.map(d => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="map.setView([${d.lat},${d.lng}],17)">
        <div style="font-weight:600;color:var(--text);">${d.alias} — ${d.duration} 分鐘</div>
        <div style="color:var(--text-muted);font-size:10px;">${formatTime(d.start)} ~ ${formatTime(d.end)}</div>
      </div>
    `).join("");
  }

  showToast(`找到 ${allDwells.length} 個停留點`, "success");
}

// ========== 4. 室內平面圖 ==========
let floorPlanOverlay = null;
let floorPlanControls = null;

function loadFloorPlan(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    if (floorPlanOverlay) map.removeLayer(floorPlanOverlay);

    const center = map.getCenter();
    const bounds = map.getBounds();
    const imgBounds = [
      [center.lat - (bounds.getNorth() - center.lat) * 0.3, center.lng - (bounds.getEast() - center.lng) * 0.3],
      [center.lat + (bounds.getNorth() - center.lat) * 0.3, center.lng + (bounds.getEast() - center.lng) * 0.3],
    ];

    floorPlanOverlay = L.imageOverlay(e.target.result, imgBounds, {
      opacity: 0.7, interactive: true,
    }).addTo(map);

    document.getElementById("btn-floorplan").classList.add("active");
    showToast("已載入平面圖，可拖曳地圖調整位置", "success");

    // 顯示控制按鈕
    if (!floorPlanControls) {
      floorPlanControls = document.createElement("div");
      floorPlanControls.className = "floorplan-controls";
      floorPlanControls.innerHTML = `
        <button onclick="adjustFloorPlanOpacity(-0.1)">透明-</button>
        <button onclick="adjustFloorPlanOpacity(0.1)">透明+</button>
        <button onclick="removeFloorPlan()">移除平面圖</button>
      `;
      document.body.appendChild(floorPlanControls);
    }
    floorPlanControls.style.display = "flex";
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

function adjustFloorPlanOpacity(delta) {
  if (!floorPlanOverlay) return;
  const current = floorPlanOverlay.options.opacity || 0.7;
  floorPlanOverlay.setOpacity(Math.max(0.1, Math.min(1, current + delta)));
}

function removeFloorPlan() {
  if (floorPlanOverlay) { map.removeLayer(floorPlanOverlay); floorPlanOverlay = null; }
  document.getElementById("btn-floorplan").classList.remove("active");
  if (floorPlanControls) floorPlanControls.style.display = "none";
}

// ========== 5. 使用報表 ==========
function generateReport(period) {
  const output = document.getElementById("report-output");
  if (latestData.length === 0) { output.innerHTML = '<div class="empty-state">尚無資料</div>'; return; }

  const now = new Date();
  const periodLabel = { daily: "日報", weekly: "週報", monthly: "月報" }[period];
  const total = latestData.length;
  const online = latestData.filter(t => t.lastRequestDate && (Date.now() - new Date(t.lastRequestDate).getTime()) < 3600000).length;
  const sos = latestData.filter(t => t.status === "sos").length;
  const lowBat = latestData.filter(t => t.lastBatteryLevel != null && t.lastBatteryLevel <= 20).length;
  const tempAlert = latestData.filter(t => t.temperature != null && (t.temperature < TEMP_MIN || t.temperature > TEMP_MAX)).length;
  const avgBat = latestData.reduce((s, t) => s + (t.lastBatteryLevel || 0), 0) / Math.max(total, 1);
  const avgTemp = latestData.filter(t => t.temperature != null).reduce((s, t) => s + t.temperature, 0) / Math.max(latestData.filter(t => t.temperature != null).length, 1);

  output.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;color:var(--text);">📊 ${periodLabel} — ${now.toLocaleDateString()}</div>
    <div class="stat-row"><span class="stat-label">裝置總數</span><span class="stat-value">${total}</span></div>
    <div class="stat-row"><span class="stat-label">在線率</span><span class="stat-value">${((online / total) * 100).toFixed(1)}%</span></div>
    <div class="stat-row"><span class="stat-label">SOS 事件</span><span class="stat-value" style="color:${sos > 0 ? "var(--danger)" : "var(--success)"};">${sos}</span></div>
    <div class="stat-row"><span class="stat-label">低電量裝置</span><span class="stat-value">${lowBat}</span></div>
    <div class="stat-row"><span class="stat-label">溫度異常</span><span class="stat-value">${tempAlert}</span></div>
    <div class="stat-row"><span class="stat-label">平均電量</span><span class="stat-value">${avgBat.toFixed(1)}%</span></div>
    <div class="stat-row"><span class="stat-label">平均溫度</span><span class="stat-value">${avgTemp.toFixed(1)}°C</span></div>
    <div style="margin-top:8px;text-align:right;">
      <button class="btn-ghost-sm" onclick="printReportSummary()">列印</button>
    </div>
  `;
  addEvent("info", `產出${periodLabel}`);
}

function printReportSummary() {
  const content = document.getElementById("report-output").innerHTML;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>UTFind 報表</title>
    <style>body{font-family:sans-serif;padding:20px;} .stat-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:13px;} .stat-label{color:#666;} .stat-value{font-weight:600;}</style>
    </head><body>${content}</body></html>`);
  win.document.close();
  win.print();
}

// ========== 6. 異常行為偵測 ==========
function detectAnomalies() {
  const anomalies = [];

  latestData.forEach(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;

    // 非正常時段移動 (00:00-06:00)
    if (tag.lastRequestDate) {
      const hour = new Date(tag.lastRequestDate).getHours();
      if (hour >= 0 && hour < 6) {
        anomalies.push({ mac: tag.mac, alias, type: "夜間移動", detail: `在 ${hour}:00 有活動`, severity: "warning" });
      }
    }

    // 電量異常下降
    const batHist = batHistory[tag.mac] || [];
    if (batHist.length >= 3) {
      const recent = batHist.slice(-3);
      const drop = recent[0] - recent[recent.length - 1];
      if (drop > 15) {
        anomalies.push({ mac: tag.mac, alias, type: "電量急降", detail: `近期下降 ${drop}%`, severity: "danger" });
      }
    }

    // 溫度持續異常
    const tempHist = tempHistory[tag.mac] || [];
    if (tempHist.length >= 3) {
      const recentTemps = tempHist.slice(-3);
      const allOut = recentTemps.every(t => t < TEMP_MIN || t > TEMP_MAX);
      if (allOut) {
        anomalies.push({ mac: tag.mac, alias, type: "溫度持續異常", detail: `連續 ${recentTemps.length} 次超標`, severity: "danger" });
      }
    }
  });

  return anomalies;
}

function renderAnomalyList() {
  const container = document.getElementById("anomaly-list");
  if (!container) return;
  const anomalies = detectAnomalies();

  if (anomalies.length === 0) {
    container.innerHTML = '<div class="empty-state">未偵測到異常</div>';
    return;
  }

  container.innerHTML = anomalies.map(a => `
    <div class="event-item" style="cursor:pointer;" onclick="focusTag('${a.mac}')">
      <span class="event-icon">${a.severity === "danger" ? "🔴" : "🟡"}</span>
      <div class="event-body">
        <div class="event-msg"><b>${a.alias}</b> — ${a.type}</div>
        <div class="event-time">${a.detail}</div>
      </div>
    </div>
  `).join("");
}

// ========== 7. 電量預測 ==========
function predictBattery() {
  const predictions = [];

  latestData.forEach(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const hist = batHistory[tag.mac] || [];

    if (hist.length < 2 || tag.lastBatteryLevel == null) {
      predictions.push({ mac: tag.mac, alias, level: tag.lastBatteryLevel || 0, daysLeft: null });
      return;
    }

    // 簡單線性迴歸預測
    const dropPerSample = (hist[0] - hist[hist.length - 1]) / hist.length;
    if (dropPerSample <= 0) {
      predictions.push({ mac: tag.mac, alias, level: tag.lastBatteryLevel, daysLeft: 999 });
    } else {
      // 假設每次刷新間隔 ≈ AUTO_REFRESH_INTERVAL
      const samplesLeft = tag.lastBatteryLevel / dropPerSample;
      const daysLeft = Math.round(samplesLeft * AUTO_REFRESH_INTERVAL / 86400);
      predictions.push({ mac: tag.mac, alias, level: tag.lastBatteryLevel, daysLeft: Math.max(0, daysLeft) });
    }
  });

  return predictions;
}

function renderBatteryPrediction() {
  const container = document.getElementById("battery-prediction-list");
  if (!container) return;
  const preds = predictBattery();

  if (preds.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無資料</div>';
    return;
  }

  container.innerHTML = preds.map(p => {
    const color = p.level <= 20 ? "var(--danger)" : p.level <= 50 ? "var(--warning)" : "var(--success)";
    const daysText = p.daysLeft == null ? "資料不足" : p.daysLeft >= 999 ? "穩定" : `≈ ${p.daysLeft} 天`;
    return `
      <div class="health-card">
        <div class="health-info">
          <div class="health-mac">${p.alias}</div>
          <div class="health-details">電量 ${p.level}% · 預估可用 ${daysText}</div>
        </div>
        <div style="width:50px;text-align:right;font-weight:700;color:${color};">${p.level}%</div>
      </div>
    `;
  }).join("");
}

// ========== 8. 裝置健康評分 ==========
function calcHealthScore(tag) {
  let score = 100;

  // 電量 (0-30 分)
  const bat = tag.lastBatteryLevel ?? 50;
  if (bat <= 10) score -= 30;
  else if (bat <= 20) score -= 20;
  else if (bat <= 50) score -= 10;

  // 更新頻率 (0-30 分)
  if (tag.lastRequestDate) {
    const ageHours = (Date.now() - new Date(tag.lastRequestDate).getTime()) / 3600000;
    if (ageHours > 24) score -= 30;
    else if (ageHours > 6) score -= 20;
    else if (ageHours > 1) score -= 10;
  } else {
    score -= 30;
  }

  // 溫度 (0-20 分)
  if (tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX)) {
    score -= 20;
  }

  // SOS (0-20 分)
  if (tag.status === "sos") score -= 20;

  return Math.max(0, Math.min(100, score));
}

function renderHealthScores() {
  const container = document.getElementById("health-score-list");
  if (!container) return;

  if (latestData.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無資料</div>';
    return;
  }

  const scored = latestData.map(tag => ({
    tag,
    score: calcHealthScore(tag),
    alias: tagAliases[tag.mac] || tag.mac,
  })).sort((a, b) => a.score - b.score);

  container.innerHTML = scored.map(({ tag, score, alias }) => {
    let grade, gradeClass;
    if (score >= 80) { grade = score; gradeClass = "excellent"; }
    else if (score >= 60) { grade = score; gradeClass = "good"; }
    else if (score >= 40) { grade = score; gradeClass = "fair"; }
    else { grade = score; gradeClass = "poor"; }

    return `
      <div class="health-card" style="cursor:pointer;" onclick="focusTag('${tag.mac}')">
        <div class="health-score-badge ${gradeClass}">${grade}</div>
        <div class="health-info">
          <div class="health-mac">${alias}</div>
          <div class="health-details">
            🔋 ${tag.lastBatteryLevel ?? "--"}% · 🌡 ${tag.temperature ?? "--"}°C · ${relativeTime(tag.lastRequestDate)}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ========== 9. 角色權限 ==========
let currentRole = localStorage.getItem("utfind_role") || "admin";

function saveRole(role) {
  currentRole = role;
  localStorage.setItem("utfind_role", role);
  updateRoleDesc();
  addAudit(`角色切換為 ${role}`);
}

function updateRoleDesc() {
  const descs = {
    admin: "管理員：完整權限，可修改所有設定、刪除資料、管理圍欄。",
    operator: "操作者：可查看資料、操作地圖、查詢歷史，但不可修改系統設定。",
    viewer: "檢視者：僅能查看儀表板和地圖，不可修改任何資料。",
  };
  const el = document.getElementById("role-desc");
  if (el) el.textContent = descs[currentRole] || "";
  const roleSelect = document.getElementById("user-role");
  if (roleSelect) roleSelect.value = currentRole;
}

// ========== 10. Tag 分組 ==========
let tagGroups = JSON.parse(localStorage.getItem("utfind_groups") || "[]");

function populateGroupCheckboxes() {
  const container = document.getElementById("group-tag-checkboxes");
  if (!container || allTags.length === 0) return;
  container.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<label class="mac-checkbox-item"><input type="checkbox" value="${t.mac}" /> ${t.mac}${alias}</label>`;
  }).join("");
}

function saveGroup() {
  const name = document.getElementById("group-name").value.trim();
  const color = document.getElementById("group-color").value;
  const macs = Array.from(document.querySelectorAll("#group-tag-checkboxes input:checked")).map(cb => cb.value);

  if (!name) { showToast("請輸入群組名稱", "warning"); return; }
  if (macs.length === 0) { showToast("請選擇至少一個 Tag", "warning"); return; }

  tagGroups.push({ id: Date.now().toString(), name, color, macs });
  localStorage.setItem("utfind_groups", JSON.stringify(tagGroups));
  document.getElementById("group-name").value = "";
  renderGroupList();
  addAudit(`建立群組: ${name}`);
  showToast(`已建立群組「${name}」`, "success");
}

function deleteGroup(id) {
  tagGroups = tagGroups.filter(g => g.id !== id);
  localStorage.setItem("utfind_groups", JSON.stringify(tagGroups));
  renderGroupList();
}

function renderGroupList() {
  const container = document.getElementById("group-list");
  if (!container) return;

  if (tagGroups.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML = tagGroups.map(g => {
    const tagNames = g.macs.map(m => tagAliases[m] || m.slice(-5)).join(", ");
    return `
      <div class="group-card">
        <div class="group-header">
          <div class="group-name-row">
            <span class="group-color-dot" style="background:${g.color};"></span>
            <span class="group-name">${g.name}</span>
          </div>
          <button class="gf-btn gf-del" onclick="deleteGroup('${g.id}')">刪除</button>
        </div>
        <div class="group-tags">${tagNames}</div>
      </div>
    `;
  }).join("");
}

// ========== 11. 任務指派 ==========
let tasks = JSON.parse(localStorage.getItem("utfind_tasks") || "[]");

function populateTaskTagSelect() {
  const sel = document.getElementById("task-tag-select");
  if (!sel || allTags.length === 0) return;
  sel.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<option value="${t.mac}">${t.mac}${alias}</option>`;
  }).join("");
}

function saveTask() {
  const name = document.getElementById("task-name").value.trim();
  const mac = document.getElementById("task-tag-select").value;
  const deadline = document.getElementById("task-deadline").value;

  if (!name) { showToast("請輸入任務名稱", "warning"); return; }

  tasks.push({
    id: Date.now().toString(),
    name,
    mac,
    deadline: deadline || null,
    status: "active",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
  document.getElementById("task-name").value = "";
  renderTaskList();
  addAudit(`建立任務: ${name}`);
  showToast(`已建立任務「${name}」`, "success");
}

function toggleTaskStatus(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = task.status === "done" ? "active" : "done";
    localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
    renderTaskList();
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
  renderTaskList();
}

function renderTaskList() {
  const container = document.getElementById("task-list");
  if (!container) return;

  if (tasks.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML = tasks.map(t => {
    const alias = tagAliases[t.mac] || t.mac;
    const isOverdue = t.deadline && new Date(t.deadline) < new Date() && t.status !== "done";
    const statusClass = t.status === "done" ? "done" : isOverdue ? "overdue" : "active";
    const statusText = t.status === "done" ? "完成" : isOverdue ? "逾期" : "進行中";

    return `
      <div class="task-card">
        <div class="task-header">
          <span class="task-name" style="${t.status === 'done' ? 'text-decoration:line-through;opacity:0.5;' : ''}">${t.name}</span>
          <span class="task-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="task-meta">
          📱 ${alias} ${t.deadline ? ` · 截止: ${formatTime(t.deadline)}` : ""}
        </div>
        <div style="margin-top:6px;display:flex;gap:4px;">
          <button class="gf-btn" onclick="toggleTaskStatus('${t.id}')">${t.status === "done" ? "重啟" : "完成"}</button>
          <button class="gf-btn gf-del" onclick="deleteTask('${t.id}')">刪除</button>
        </div>
      </div>
    `;
  }).join("");
}

// ========== 12. 稽核日誌 ==========
let auditLog = JSON.parse(localStorage.getItem("utfind_audit") || "[]").slice(0, 200);

function addAudit(action) {
  const entry = {
    action,
    role: currentRole,
    time: new Date().toISOString(),
  };
  auditLog.unshift(entry);
  if (auditLog.length > 200) auditLog.pop();
  localStorage.setItem("utfind_audit", JSON.stringify(auditLog));
  renderAuditLog();
}

function renderAuditLog() {
  const container = document.getElementById("audit-log-list");
  if (!container) return;

  if (auditLog.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無操作記錄</div>';
    return;
  }

  container.innerHTML = auditLog.slice(0, 50).map(e => `
    <div class="event-item">
      <span class="event-icon">📝</span>
      <div class="event-body">
        <div class="event-msg">${e.action}</div>
        <div class="event-time">[${e.role}] ${formatTime(e.time)}</div>
      </div>
    </div>
  `).join("");
}

// ========== 13. 多渠道通知 ==========
let notifConfig = JSON.parse(localStorage.getItem("utfind_notif_config") || "{}");

function saveNotifConfig() {
  notifConfig = {
    lineToken: document.getElementById("line-token").value.trim(),
    telegramToken: document.getElementById("telegram-token").value.trim(),
    telegramChat: document.getElementById("telegram-chat").value.trim(),
    webhookUrl: document.getElementById("webhook-url").value.trim(),
  };
  localStorage.setItem("utfind_notif_config", JSON.stringify(notifConfig));
  addAudit("更新通知設定");
  showToast("通知設定已儲存", "success");
}

function loadNotifConfig() {
  if (notifConfig.lineToken) document.getElementById("line-token").value = notifConfig.lineToken;
  if (notifConfig.telegramToken) document.getElementById("telegram-token").value = notifConfig.telegramToken;
  if (notifConfig.telegramChat) document.getElementById("telegram-chat").value = notifConfig.telegramChat;
  if (notifConfig.webhookUrl) document.getElementById("webhook-url").value = notifConfig.webhookUrl;
}

function testNotifChannels() {
  const msg = `[UTFind 測試] ${new Date().toLocaleString()} — 系統正常，共 ${latestData.length} 個裝置`;
  sendExternalNotification(msg);
  showToast("已發送測試通知", "info");
}

function sendExternalNotification(message) {
  // Webhook
  if (notifConfig.webhookUrl) {
    fetch(notifConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, timestamp: new Date().toISOString() }),
    }).catch(e => console.log("Webhook error:", e));
  }

  // LINE Notify
  if (notifConfig.lineToken) {
    fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${notifConfig.lineToken}`,
      },
      body: `message=${encodeURIComponent(message)}`,
    }).catch(e => console.log("LINE error:", e));
  }

  // Telegram
  if (notifConfig.telegramToken && notifConfig.telegramChat) {
    fetch(`https://api.telegram.org/bot${notifConfig.telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: notifConfig.telegramChat, text: message }),
    }).catch(e => console.log("Telegram error:", e));
  }
}

// 增強 showToast 以同時送外部通知（僅 danger 等級）
const _origShowToast = showToast;
showToast = function(message, type, duration) {
  _origShowToast(message, type, duration);
  if (type === "danger" && (notifConfig.webhookUrl || notifConfig.lineToken || notifConfig.telegramToken)) {
    sendExternalNotification(message);
  }
};

// ========== 14. 排程通知 ==========
let scheduleTimer = null;

function saveSchedule() {
  const interval = parseInt(document.getElementById("schedule-interval").value);
  localStorage.setItem("utfind_schedule", interval);

  if (scheduleTimer) clearInterval(scheduleTimer);

  if (interval > 0) {
    scheduleTimer = setInterval(() => {
      const total = latestData.length;
      const online = latestData.filter(t => t.lastRequestDate && (Date.now() - new Date(t.lastRequestDate).getTime()) < 3600000).length;
      const sos = latestData.filter(t => t.status === "sos").length;
      const msg = `[UTFind 定時摘要] 裝置: ${total}, 在線: ${online}, SOS: ${sos}`;
      sendExternalNotification(msg);
      showToast("已發送定時摘要", "info", 2000);
    }, interval * 1000);

    document.getElementById("schedule-status").className = "status success";
    document.getElementById("schedule-status").textContent = `已啟用，每 ${interval / 3600} 小時發送`;
  } else {
    document.getElementById("schedule-status").textContent = "";
  }
}

function loadSchedule() {
  const saved = localStorage.getItem("utfind_schedule");
  if (saved) {
    document.getElementById("schedule-interval").value = saved;
    if (parseInt(saved) > 0) saveSchedule();
  }
}

// ========== 15. 第三方整合 ==========
let integrationConfig = JSON.parse(localStorage.getItem("utfind_integrations") || "{}");

function exportToGoogleSheets() {
  if (latestData.length === 0) { showToast("尚無資料可匯出", "warning"); return; }

  // 產生 CSV 並提供下載（可匯入 Google Sheets）
  let csv = "MAC,Alias,Status,Battery,Temperature,Humidity,Latitude,Longitude,LastUpdate\n";
  latestData.forEach(t => {
    csv += `${t.mac},${tagAliases[t.mac] || ""},${t.status || "normal"},${t.lastBatteryLevel ?? ""},${t.temperature ?? ""},${t.humidity ?? ""},${t.lastLatitude ?? ""},${t.lastLongitude ?? ""},${t.lastRequestDate || ""}\n`;
  });
  downloadFile(csv, `utfind_export_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  showToast("已匯出 CSV，可匯入 Google Sheets", "success");
  addAudit("匯出資料至 CSV");
}

function saveIntegrationConfig() {
  integrationConfig.iftttKey = document.getElementById("ifttt-key").value.trim();
  localStorage.setItem("utfind_integrations", JSON.stringify(integrationConfig));
  showToast("整合設定已儲存", "success");
  addAudit("更新第三方整合設定");
}

function loadIntegrationConfig() {
  if (integrationConfig.iftttKey) {
    const el = document.getElementById("ifttt-key");
    if (el) el.value = integrationConfig.iftttKey;
  }
}

// ========== 16. API Webhook ==========
let webhookConfig = JSON.parse(localStorage.getItem("utfind_webhook_config") || "{}");

function saveWebhookConfig() {
  webhookConfig = {
    url: document.getElementById("api-webhook-url").value.trim(),
    events: {
      sos: document.getElementById("wh-sos").checked,
      lowbat: document.getElementById("wh-lowbat").checked,
      temp: document.getElementById("wh-temp").checked,
      geofence: document.getElementById("wh-geofence").checked,
    },
  };
  localStorage.setItem("utfind_webhook_config", JSON.stringify(webhookConfig));
  showToast("Webhook 設定已儲存", "success");
  addAudit("更新 Webhook 設定");
}

function loadWebhookConfig() {
  if (webhookConfig.url) {
    const el = document.getElementById("api-webhook-url");
    if (el) el.value = webhookConfig.url;
  }
  if (webhookConfig.events) {
    ["sos", "lowbat", "temp", "geofence"].forEach(k => {
      const el = document.getElementById(`wh-${k}`);
      if (el && webhookConfig.events[k] !== undefined) el.checked = webhookConfig.events[k];
    });
  }
}

function triggerWebhook(eventType, payload) {
  if (!webhookConfig.url || !webhookConfig.events || !webhookConfig.events[eventType]) return;
  fetch(webhookConfig.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() }),
  }).catch(e => console.log("Webhook trigger error:", e));
}

// ========== 17. OTA 韌體更新 (模擬) ==========
function renderOTAList() {
  const container = document.getElementById("ota-list");
  if (!container) return;

  if (latestData.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無裝置</div>';
    return;
  }

  container.innerHTML = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const fw = "v1.2.3";
    return `
      <div class="health-card">
        <div class="health-info">
          <div class="health-mac">${alias}</div>
          <div class="health-details">韌體: ${fw} · 最新: v1.2.3</div>
        </div>
        <button class="gf-btn" onclick="simulateOTA('${tag.mac}')" style="color:var(--success);">✓ 最新</button>
      </div>
    `;
  }).join("");
}

function simulateOTA(mac) {
  showToast(`${tagAliases[mac] || mac} 韌體已是最新版本`, "info");
}

// ========== 18. E-Ink 標籤顯示 (模擬) ==========
function populateEinkSelect() {
  const sel = document.getElementById("eink-tag-select");
  if (!sel || allTags.length === 0) return;
  sel.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<option value="${t.mac}">${t.mac}${alias}</option>`;
  }).join("");
}

function sendEinkUpdate() {
  const mac = document.getElementById("eink-tag-select").value;
  const text = document.getElementById("eink-text").value.trim();
  const status = document.getElementById("eink-status");

  if (!mac) { status.className = "status error"; status.textContent = "請選擇 Tag"; return; }
  if (!text) { status.className = "status error"; status.textContent = "請輸入顯示文字"; return; }

  status.className = "status info";
  status.innerHTML = '<span class="spinner"></span>傳送中...';

  setTimeout(() => {
    status.className = "status success";
    status.textContent = `已更新 ${tagAliases[mac] || mac} 的 E-Ink 顯示`;
    addAudit(`更新 E-Ink 標籤: ${mac} → "${text}"`);
    showToast(`E-Ink 標籤已更新: ${text}`, "success");
  }, 1500);
}

// ========== 19. 資產生命週期 ==========
let assetLifecycle = JSON.parse(localStorage.getItem("utfind_assets") || "{}");

function cycleAssetStatus(mac) {
  const states = ["active", "maintenance", "retired"];
  const current = assetLifecycle[mac] || "active";
  const next = states[(states.indexOf(current) + 1) % states.length];
  assetLifecycle[mac] = next;
  localStorage.setItem("utfind_assets", JSON.stringify(assetLifecycle));
  renderAssetList();
  addAudit(`${mac} 狀態變更為 ${next}`);
}

function renderAssetList() {
  const container = document.getElementById("asset-list");
  if (!container) return;

  if (latestData.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無裝置</div>';
    return;
  }

  const statusLabels = { active: "使用中", maintenance: "維護中", retired: "已報廢" };

  container.innerHTML = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const status = assetLifecycle[tag.mac] || "active";
    return `
      <div class="asset-card">
        <div class="asset-info">
          <div class="asset-mac">${alias}</div>
          <div class="asset-status-row">${tag.mac}</div>
        </div>
        <span class="lifecycle-badge ${status}" onclick="cycleAssetStatus('${tag.mac}')" title="點擊切換狀態">
          ${statusLabels[status]}
        </span>
      </div>
    `;
  }).join("");
}

// ========== 20. SLA 監控 ==========
function renderSLA() {
  const output = document.getElementById("sla-output");
  const targetMin = parseInt(document.getElementById("sla-target").value) || 60;

  if (latestData.length === 0) {
    output.innerHTML = '<div class="empty-state">尚無資料</div>';
    return;
  }

  output.innerHTML = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;

    // 計算最後回報距今的分鐘數
    let lastMinutes = Infinity;
    if (tag.lastRequestDate) {
      lastMinutes = (Date.now() - new Date(tag.lastRequestDate).getTime()) / 60000;
    }

    const compliant = lastMinutes <= targetMin;
    const pct = compliant ? 100 : Math.max(0, Math.round((1 - (lastMinutes - targetMin) / targetMin) * 100));
    const color = pct >= 90 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--danger)";

    return `
      <div class="sla-bar-container">
        <div class="sla-label-row">
          <span class="sla-label">${alias}</span>
          <span class="sla-pct" style="color:${color};">${pct}%</span>
        </div>
        <div class="sla-bar">
          <div class="sla-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>
    `;
  }).join("");
}

// ========== 冷鏈：GDP/GSP 合規報告 ==========
function populateColdChainSelects() {
  const selects = ["gdp-tag-select", "batch-tag-select", "handover-tag-select", "tempzone-tag-select", "loading-tag-select", "eta-tag-select"];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || allTags.length === 0) return;
    sel.innerHTML = allTags.map(t => {
      const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
      return `<option value="${t.mac}">${t.mac}${alias}</option>`;
    }).join("");
  });
}

function generateGDPReport() {
  const mac = document.getElementById("gdp-tag-select").value;
  if (!mac) { showToast("請選擇 Tag", "warning"); return; }

  const tag = latestData.find(t => t.mac === mac);
  const alias = tagAliases[mac] || mac;
  const batch = batchBindings[mac];
  const zone = tempZones[mac] || { type: "cold", min: TEMP_MIN, max: TEMP_MAX };
  const excursion = excursionTimers[mac] || { totalMinutes: 0 };
  const handovers = handoverRecords.filter(h => h.mac === mac);

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>GDP/GSP 溫度運送報告</title>
    <style>
      body{font-family:sans-serif;padding:30px;color:#333;max-width:800px;margin:0 auto;}
      h1{color:#3b82f6;font-size:20px;text-align:center;}
      .subtitle{text-align:center;color:#666;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px;}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;}
      th{background:#f0f2f5;font-weight:600;}
      .section{margin:20px 0;}
      .section h2{font-size:14px;color:#333;border-bottom:2px solid #3b82f6;padding-bottom:4px;}
      .sign-area{display:flex;justify-content:space-between;margin-top:40px;padding-top:20px;border-top:1px solid #ddd;}
      .sign-box{text-align:center;width:30%;}
      .sign-line{border-top:1px solid #333;margin-top:40px;padding-top:4px;font-size:11px;color:#666;}
      .pass{color:#22c55e;font-weight:700;} .fail{color:#ef4444;font-weight:700;}
      .stamp{text-align:center;margin:20px 0;font-size:11px;color:#999;}
    </style></head><body>
    <h1>GDP/GSP 溫度運送合規報告</h1>
    <p class="subtitle">Good Distribution Practice — Temperature Controlled Transport Record</p>

    <div class="section"><h2>裝置資訊</h2>
    <table><tr><th>Tag MAC</th><td>${mac}</td><th>名稱</th><td>${alias}</td></tr>
    <tr><th>批號</th><td>${batch ? batch.batchNo : "未綁定"}</td><th>效期</th><td>${batch ? batch.expiry : "--"}</td></tr>
    <tr><th>溫層</th><td>${zone.type === "cold" ? "冷藏" : zone.type === "frozen" ? "冷凍" : "常溫"} (${zone.min}~${zone.max}°C)</td><th>報告日期</th><td>${new Date().toLocaleDateString()}</td></tr></table></div>

    <div class="section"><h2>溫度紀錄</h2>
    <table><tr><th>項目</th><th>數值</th><th>合規</th></tr>
    <tr><td>當前溫度</td><td>${tag?.temperature ?? "--"}°C</td><td class="${tag?.temperature >= zone.min && tag?.temperature <= zone.max ? "pass" : "fail"}">${tag?.temperature >= zone.min && tag?.temperature <= zone.max ? "PASS ✓" : "FAIL ✗"}</td></tr>
    <tr><td>溫度範圍</td><td>${zone.min}°C ~ ${zone.max}°C</td><td>--</td></tr>
    <tr><td>累計逸脫時間</td><td>${excursion.totalMinutes} 分鐘</td><td class="${excursion.totalMinutes < 30 ? "pass" : "fail"}">${excursion.totalMinutes < 30 ? "PASS ✓" : "FAIL ✗"}</td></tr>
    <tr><td>電量</td><td>${tag?.lastBatteryLevel ?? "--"}%</td><td class="${(tag?.lastBatteryLevel ?? 100) > 20 ? "pass" : "fail"}">${(tag?.lastBatteryLevel ?? 100) > 20 ? "PASS ✓" : "FAIL ✗"}</td></tr></table></div>

    <div class="section"><h2>交接紀錄</h2>
    ${handovers.length > 0 ? `<table><tr><th>#</th><th>時間</th><th>簽收人</th><th>溫度快照</th></tr>
    ${handovers.map((h, i) => `<tr><td>${i + 1}</td><td>${new Date(h.time).toLocaleString()}</td><td>${h.person}</td><td>${h.tempSnapshot}°C</td></tr>`).join("")}</table>` : "<p>無交接紀錄</p>"}</div>

    <div class="sign-area">
      <div class="sign-box"><div class="sign-line">出貨人簽章</div></div>
      <div class="sign-box"><div class="sign-line">運送人簽章</div></div>
      <div class="sign-box"><div class="sign-line">收貨人簽章</div></div>
    </div>
    <div class="stamp">本報告由 UTFind IoT Dashboard v3.0.0 自動產出 · ${new Date().toLocaleString()}</div>
    </body></html>`);
  win.document.close();
  win.print();
  addAudit(`產出 GDP 報告: ${alias}`);
  addEvent("info", `產出 ${alias} 的 GDP/GSP 合規報告`);
}

// ========== 冷鏈：溫度逸脫計時器 ==========
let excursionTimers = JSON.parse(localStorage.getItem("utfind_excursions") || "{}");

function updateExcursionTimers() {
  latestData.forEach(tag => {
    const zone = tempZones[tag.mac] || { min: TEMP_MIN, max: TEMP_MAX };
    if (!excursionTimers[tag.mac]) excursionTimers[tag.mac] = { totalMinutes: 0, lastCheck: null, inExcursion: false };

    const timer = excursionTimers[tag.mac];
    const now = Date.now();
    const outOfRange = tag.temperature != null && (tag.temperature < zone.min || tag.temperature > zone.max);

    if (outOfRange) {
      if (!timer.inExcursion) {
        timer.inExcursion = true;
        timer.lastCheck = now;
      } else if (timer.lastCheck) {
        timer.totalMinutes += (now - timer.lastCheck) / 60000;
        timer.lastCheck = now;
      }

      if (timer.totalMinutes >= 30) {
        showToast(`⚠️ ${tagAliases[tag.mac] || tag.mac} 溫度逸脫超過 30 分鐘，批次可能需作廢`, "danger");
      }
    } else {
      timer.inExcursion = false;
      timer.lastCheck = now;
    }
  });
  localStorage.setItem("utfind_excursions", JSON.stringify(excursionTimers));
}

function renderExcursionList() {
  const container = document.getElementById("excursion-list");
  if (!container || latestData.length === 0) return;

  container.innerHTML = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const timer = excursionTimers[tag.mac] || { totalMinutes: 0, inExcursion: false };
    const mins = Math.round(timer.totalMinutes);
    const cls = mins === 0 ? "safe" : mins < 30 ? "warning" : "danger";

    return `<div class="excursion-card">
      <div class="health-info">
        <div class="health-mac">${alias}</div>
        <div class="health-details">${timer.inExcursion ? "🔴 逸脫中" : "🟢 正常"} · 溫度 ${tag.temperature ?? "--"}°C</div>
      </div>
      <span class="excursion-timer ${cls}">${mins}m</span>
    </div>`;
  }).join("");
}

// ========== 冷鏈：批號綁定 ==========
let batchBindings = JSON.parse(localStorage.getItem("utfind_batches") || "{}");

function saveBatchBinding() {
  const mac = document.getElementById("batch-tag-select").value;
  const batchNo = document.getElementById("batch-number").value.trim();
  const expiry = document.getElementById("batch-expiry").value;

  if (!mac || !batchNo) { showToast("請填寫 Tag 和批號", "warning"); return; }

  batchBindings[mac] = { batchNo, expiry: expiry || null, bindDate: new Date().toISOString() };
  localStorage.setItem("utfind_batches", JSON.stringify(batchBindings));
  renderBatchList();
  renderExpiryCountdown();
  addAudit(`綁定批號: ${mac} → ${batchNo}`);
  showToast(`已綁定批號 ${batchNo}`, "success");
}

function renderBatchList() {
  const container = document.getElementById("batch-list");
  if (!container) return;

  const entries = Object.entries(batchBindings);
  if (entries.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML = entries.map(([mac, b]) => {
    const alias = tagAliases[mac] || mac;
    return `<div class="geofence-item">
      <div><div class="gf-name">${b.batchNo}</div><div class="gf-radius">${alias} · 效期: ${b.expiry || "未設定"}</div></div>
      <button class="gf-btn gf-del" onclick="deleteBatch('${mac}')">解除</button>
    </div>`;
  }).join("");
}

function deleteBatch(mac) {
  delete batchBindings[mac];
  localStorage.setItem("utfind_batches", JSON.stringify(batchBindings));
  renderBatchList();
  renderExpiryCountdown();
}

// ========== 冷鏈：交接簽收鏈 ==========
let handoverRecords = JSON.parse(localStorage.getItem("utfind_handovers") || "[]");

function recordHandover() {
  const mac = document.getElementById("handover-tag-select").value;
  const person = document.getElementById("handover-person").value.trim();
  if (!mac || !person) { showToast("請選擇 Tag 並填寫簽收人", "warning"); return; }

  const tag = latestData.find(t => t.mac === mac);
  const record = {
    id: Date.now().toString(),
    mac,
    person,
    time: new Date().toISOString(),
    tempSnapshot: tag?.temperature ?? "--",
    location: tag ? `${tag.lastLatitude?.toFixed(5)}, ${tag.lastLongitude?.toFixed(5)}` : "--",
  };

  handoverRecords.unshift(record);
  localStorage.setItem("utfind_handovers", JSON.stringify(handoverRecords));
  document.getElementById("handover-person").value = "";
  renderHandoverList();
  addEvent("info", `${person} 簽收 ${tagAliases[mac] || mac}`);
  addAudit(`交接簽收: ${tagAliases[mac] || mac} → ${person}`);
  showToast(`已記錄 ${person} 簽收`, "success");
}

function renderHandoverList() {
  const container = document.getElementById("handover-list");
  if (!container) return;

  if (handoverRecords.length === 0) { container.innerHTML = '<div class="empty-state">尚無交接紀錄</div>'; return; }

  container.innerHTML = handoverRecords.slice(0, 30).map(h => {
    const alias = tagAliases[h.mac] || h.mac;
    return `<div class="event-item">
      <span class="event-icon">✍️</span>
      <div class="event-body">
        <div class="event-msg"><b>${h.person}</b> 簽收 ${alias}</div>
        <div class="event-time">溫度: ${h.tempSnapshot}°C · ${formatTime(h.time)}</div>
      </div>
    </div>`;
  }).join("");
}

// ========== 冷鏈：多段溫層 ==========
let tempZones = JSON.parse(localStorage.getItem("utfind_tempzones") || "{}");
const TEMP_ZONE_RANGES = {
  cold: { min: 2, max: 8, label: "冷藏" },
  frozen: { min: -25, max: -15, label: "冷凍" },
  ambient: { min: 15, max: 25, label: "常溫" },
};

function saveTempZone() {
  const mac = document.getElementById("tempzone-tag-select").value;
  const type = document.getElementById("tempzone-type").value;
  if (!mac) return;

  const range = TEMP_ZONE_RANGES[type];
  tempZones[mac] = { type, min: range.min, max: range.max };
  localStorage.setItem("utfind_tempzones", JSON.stringify(tempZones));
  renderTempZoneList();
  addAudit(`設定溫層: ${mac} → ${range.label}`);
  showToast(`已設定為${range.label} (${range.min}~${range.max}°C)`, "success");
}

function renderTempZoneList() {
  const container = document.getElementById("tempzone-list");
  if (!container) return;

  const entries = Object.entries(tempZones);
  if (entries.length === 0) { container.innerHTML = ""; return; }

  container.innerHTML = entries.map(([mac, z]) => {
    const alias = tagAliases[mac] || mac;
    const range = TEMP_ZONE_RANGES[z.type];
    return `<div class="geofence-item">
      <div><div class="gf-name">${alias}</div><div class="gf-radius">${range.label} (${z.min}~${z.max}°C)</div></div>
      <button class="gf-btn gf-del" onclick="deleteTempZone('${mac}')">刪除</button>
    </div>`;
  }).join("");
}

function deleteTempZone(mac) {
  delete tempZones[mac];
  localStorage.setItem("utfind_tempzones", JSON.stringify(tempZones));
  renderTempZoneList();
}

// ========== 冷鏈：HACCP 風險矩陣 ==========
function renderHACCPMatrix() {
  const container = document.getElementById("haccp-matrix");
  if (!container || latestData.length === 0) { return; }

  let highCount = 0, medCount = 0, lowCount = 0;
  latestData.forEach(tag => {
    const zone = tempZones[tag.mac] || { min: TEMP_MIN, max: TEMP_MAX };
    const excursion = excursionTimers[tag.mac] || { totalMinutes: 0 };
    const tempOut = tag.temperature != null && (tag.temperature < zone.min || tag.temperature > zone.max);

    if (tempOut && excursion.totalMinutes >= 30) highCount++;
    else if (tempOut || excursion.totalMinutes >= 10) medCount++;
    else lowCount++;
  });

  container.innerHTML = `
    <div class="haccp-grid">
      <div class="haccp-cell haccp-header">風險等級</div>
      <div class="haccp-cell haccp-header">低風險</div>
      <div class="haccp-cell haccp-header">中風險</div>
      <div class="haccp-cell haccp-header">高風險</div>
      <div class="haccp-cell haccp-header">裝置數</div>
      <div class="haccp-cell haccp-low">${lowCount}</div>
      <div class="haccp-cell haccp-medium">${medCount}</div>
      <div class="haccp-cell haccp-high">${highCount}</div>
      <div class="haccp-cell haccp-header">說明</div>
      <div class="haccp-cell haccp-low">溫度合規</div>
      <div class="haccp-cell haccp-medium">偶發逸脫</div>
      <div class="haccp-cell haccp-high">持續逸脫 ≥30m</div>
    </div>
    <div style="margin-top:8px;font-size:10px;color:var(--text-faint);">
      總計 ${latestData.length} 裝置 · 更新: ${new Date().toLocaleTimeString()}
    </div>
  `;
}

// ========== 冷鏈：效期倒數 ==========
function renderExpiryCountdown() {
  const container = document.getElementById("expiry-countdown-list");
  if (!container) return;

  const entries = Object.entries(batchBindings).filter(([, b]) => b.expiry);
  if (entries.length === 0) { container.innerHTML = '<div class="empty-state">請先綁定批號與效期</div>'; return; }

  container.innerHTML = entries.map(([mac, b]) => {
    const alias = tagAliases[mac] || mac;
    const daysLeft = Math.ceil((new Date(b.expiry) - new Date()) / 86400000);
    const color = daysLeft <= 7 ? "var(--danger)" : daysLeft <= 30 ? "var(--warning)" : "var(--success)";
    const urgent = daysLeft <= 0 ? "已過期！" : `${daysLeft} 天`;

    return `<div class="health-card">
      <div class="health-info">
        <div class="health-mac">${alias} · ${b.batchNo}</div>
        <div class="health-details">效期: ${b.expiry}</div>
      </div>
      <span style="font-size:16px;font-weight:800;color:${color};">${urgent}</span>
    </div>`;
  }).join("");
}

// ========== 物流：籠車週轉率 ==========
function renderTurnoverRate() {
  const container = document.getElementById("turnover-list");
  if (!container || latestData.length === 0) { return; }

  container.innerHTML = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    // 模擬週轉數據 — 實際應從歷史出入倉紀錄計算
    const cycleHours = 4 + Math.random() * 20;
    const cyclesPerDay = Math.round(24 / cycleHours * 10) / 10;
    const efficiency = Math.min(100, Math.round(cyclesPerDay / 3 * 100));
    const color = efficiency >= 80 ? "var(--success)" : efficiency >= 50 ? "var(--warning)" : "var(--danger)";

    return `<div class="turnover-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="health-mac">${alias}</div>
          <div class="health-details">平均週期 ${cycleHours.toFixed(1)}h · 日週轉 ${cyclesPerDay} 次</div>
        </div>
        <span style="font-weight:700;color:${color};">${efficiency}%</span>
      </div>
      <div class="turnover-bar"><div class="turnover-fill" style="width:${efficiency}%;background:${color};"></div></div>
    </div>`;
  }).join("");
}

// ========== 物流：門市滯留預警 ==========
function checkStoreDwell() {
  const threshold = parseFloat(document.getElementById("dwell-threshold-hours").value) || 4;
  const container = document.getElementById("store-dwell-list");

  const alerts = latestData.filter(tag => {
    if (!tag.lastRequestDate) return false;
    const hours = (Date.now() - new Date(tag.lastRequestDate).getTime()) / 3600000;
    return hours > threshold;
  });

  if (alerts.length === 0) {
    container.innerHTML = '<div class="empty-state">無滯留裝置</div>';
    showToast("所有裝置正常", "success");
    return;
  }

  container.innerHTML = alerts.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const hours = ((Date.now() - new Date(tag.lastRequestDate).getTime()) / 3600000).toFixed(1);
    return `<div class="excursion-card" style="cursor:pointer;" onclick="focusTag('${tag.mac}')">
      <div class="health-info">
        <div class="health-mac">${alias}</div>
        <div class="health-details">滯留 ${hours} 小時 · 超過閾值 ${threshold}h</div>
      </div>
      <span class="excursion-timer danger">${hours}h</span>
    </div>`;
  }).join("");

  showToast(`發現 ${alerts.length} 台滯留裝置`, "warning");
}

// ========== 物流：路線偏離偵測 ==========
function checkRouteDeviation() {
  const maxDev = parseInt(document.getElementById("route-deviation-m").value) || 500;
  const container = document.getElementById("route-deviation-list");

  if (historyRawData.length === 0 || geofences.length === 0) {
    container.innerHTML = '<div class="empty-state">需要歷史軌跡 + 圍欄資料</div>';
    return;
  }

  const deviations = [];
  historyRawData.forEach(({ mac, data }) => {
    const alias = tagAliases[mac] || mac;
    data.forEach(point => {
      if (point.lastLatitude == null) return;
      let minDist = Infinity;
      geofences.forEach(gf => {
        const dist = haversine(point.lastLatitude, point.lastLongitude, gf.lat, gf.lng) * 1000;
        minDist = Math.min(minDist, dist);
      });
      if (minDist > maxDev) {
        deviations.push({ mac, alias, lat: point.lastLatitude, lng: point.lastLongitude, dist: Math.round(minDist), time: point.lastRequestDate });
      }
    });
  });

  if (deviations.length === 0) {
    container.innerHTML = '<div class="empty-state">無偏離紀錄</div>';
    showToast("路線正常", "success");
    return;
  }

  const unique = deviations.slice(0, 20);
  container.innerHTML = unique.map(d => `
    <div class="excursion-card" style="cursor:pointer;" onclick="map.setView([${d.lat},${d.lng}],16)">
      <div class="health-info">
        <div class="health-mac">${d.alias}</div>
        <div class="health-details">偏離 ${d.dist}m · ${formatTime(d.time)}</div>
      </div>
      <span class="excursion-timer warning">${d.dist}m</span>
    </div>
  `).join("");

  showToast(`發現 ${deviations.length} 筆偏離紀錄`, "warning");
}

// ========== 物流：裝載率 ==========
function calcLoadingRate() {
  const orders = parseInt(document.getElementById("loading-orders").value) || 0;
  const capacity = parseInt(document.getElementById("loading-capacity").value) || 200;
  const rate = Math.min(100, Math.round(orders / capacity * 100));
  const color = rate >= 80 ? "var(--success)" : rate >= 50 ? "var(--warning)" : "var(--danger)";

  document.getElementById("loading-result").innerHTML = `
    <div style="text-align:center;padding:12px;">
      <div style="font-size:32px;font-weight:800;color:${color};">${rate}%</div>
      <div style="font-size:11px;color:var(--text-muted);">裝載率 (${orders}/${capacity})</div>
      <div class="sla-bar" style="margin-top:8px;"><div class="sla-fill" style="width:${rate}%;background:${color};"></div></div>
    </div>
  `;
}

// ========== 物流：ETA 預測 ==========
let etaDest = null;
let etaPickMode = false;

function pickETADest() {
  etaPickMode = true;
  map.getContainer().style.cursor = "crosshair";
  showToast("點擊地圖選取目的地", "info", 3000);
}

map.on("click", function etaHandler(e) {
  if (!etaPickMode) return;
  etaPickMode = false;
  etaDest = e.latlng;
  map.getContainer().style.cursor = "";
  document.getElementById("btn-eta-pick").textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;

  // 計算 ETA
  const mac = document.getElementById("eta-tag-select").value;
  const tag = latestData.find(t => t.mac === mac);
  if (!tag || tag.lastLatitude == null) {
    document.getElementById("eta-result").innerHTML = '<span class="status error">無定位資料</span>';
    return;
  }

  const dist = haversine(tag.lastLatitude, tag.lastLongitude, etaDest.lat, etaDest.lng);
  const avgSpeed = 30; // 假設市區平均 30 km/h
  const etaMinutes = Math.round(dist / avgSpeed * 60);
  const etaTime = new Date(Date.now() + etaMinutes * 60000);

  document.getElementById("eta-result").innerHTML = `
    <div class="eta-display">
      <div class="eta-time">${etaMinutes < 60 ? etaMinutes + " 分鐘" : (etaMinutes / 60).toFixed(1) + " 小時"}</div>
      <div class="eta-label">預計 ${etaTime.getHours()}:${String(etaTime.getMinutes()).padStart(2, "0")} 到達 · 距離 ${dist.toFixed(1)} km</div>
    </div>
  `;
});

// ========== 物流：資產盤點 ==========
function inventoryCount() {
  const output = document.getElementById("inventory-result");
  if (latestData.length === 0) { output.innerHTML = '<div class="empty-state">無裝置資料</div>'; return; }

  // 依圍欄分組計算在各區域的裝置數
  const locationCounts = {};
  let unassigned = 0;

  latestData.forEach(tag => {
    if (tag.lastLatitude == null) { unassigned++; return; }
    let found = false;
    geofences.forEach(gf => {
      const dist = haversine(tag.lastLatitude, tag.lastLongitude, gf.lat, gf.lng) * 1000;
      if (dist <= gf.radius) {
        locationCounts[gf.name] = (locationCounts[gf.name] || 0) + 1;
        found = true;
      }
    });
    if (!found) unassigned++;
  });

  let html = `<div style="font-weight:600;margin-bottom:8px;color:var(--text);">盤點結果 — ${new Date().toLocaleString()}</div>`;
  html += `<div class="stat-row"><span class="stat-label">裝置總數</span><span class="stat-value">${latestData.length}</span></div>`;

  Object.entries(locationCounts).forEach(([name, count]) => {
    html += `<div class="stat-row"><span class="stat-label">📍 ${name}</span><span class="stat-value">${count}</span></div>`;
  });

  html += `<div class="stat-row"><span class="stat-label">未在圍欄內</span><span class="stat-value" style="color:var(--warning);">${unassigned}</span></div>`;

  if (Object.keys(locationCounts).length === 0 && geofences.length === 0) {
    html += '<div style="color:var(--text-faint);font-size:11px;margin-top:8px;">提示：建立地理圍欄後可依區域盤點</div>';
  }

  output.innerHTML = html;
  addEvent("info", `執行資產盤點，共 ${latestData.length} 台`);
}

// ========== 物流：調度大屏 ==========
function openDispatchBoard() {
  const board = document.createElement("div");
  board.className = "dispatch-board";
  board.id = "dispatch-board";

  const cards = latestData.map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const statusClass = tag.status === "sos" ? "sos" : "normal";
    const statusColor = tag.status === "sos" ? "background:rgba(239,68,68,0.15);color:#ef4444;" : "background:rgba(34,197,94,0.15);color:#22c55e;";
    const statusText = tag.status === "sos" ? "SOS" : "正常";
    const bat = tag.lastBatteryLevel ?? "--";
    const temp = tag.temperature != null ? `${tag.temperature}°C` : "--";

    return `<div class="dispatch-card">
      <div class="dispatch-card-header">
        <span class="dispatch-card-name">${alias}</span>
        <span class="dispatch-card-status" style="${statusColor}">${statusText}</span>
      </div>
      <div class="dispatch-card-meta">
        📱 ${tag.mac}<br>
        🔋 ${bat}% · 🌡 ${temp}<br>
        📍 ${tag.lastLatitude?.toFixed(4)}, ${tag.lastLongitude?.toFixed(4)}<br>
        🕐 ${relativeTime(tag.lastRequestDate)}
      </div>
    </div>`;
  }).join("");

  board.innerHTML = `
    <div class="dispatch-header">
      <h1>📋 UTFind 調度看板</h1>
      <div>
        <span style="font-size:13px;color:var(--text-muted);margin-right:16px;">${new Date().toLocaleString()} · ${latestData.length} 台裝置</span>
        <button class="btn-ghost-sm" onclick="document.getElementById('dispatch-board').remove()">關閉 ✕</button>
      </div>
    </div>
    <div class="dispatch-grid">${cards}</div>
  `;

  document.body.appendChild(board);
}

// ========== 15. 碳足跡計算 ==========
function calcCarbonFootprint() {
  if (historyRawData.length === 0) return { totalKm: 0, co2Kg: 0 };
  let totalKm = 0;
  historyRawData.forEach(({ data }) => {
    for (let i = 1; i < data.length; i++) {
      const p1 = data[i - 1], p2 = data[i];
      if (p1.lastLatitude != null && p2.lastLatitude != null)
        totalKm += haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude);
    }
  });
  return { totalKm: totalKm.toFixed(1), co2Kg: (totalKm * 0.21).toFixed(2) }; // 0.21 kg CO2/km 柴油貨車
}

// ========== 16. 語音播報 ==========
let voiceEnabled = false;

function toggleVoiceAlert() {
  voiceEnabled = !voiceEnabled;
  showToast(voiceEnabled ? "語音播報已開啟" : "語音播報已關閉", "info", 2000);
}

function speakAlert(text) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = currentLang === "zh" ? "zh-TW" : "en-US";
  utterance.rate = 1.1;
  utterance.volume = 0.8;
  speechSynthesis.speak(utterance);
}

// 增強警報以加入語音
const _origCheckAlerts2 = checkAlerts;
checkAlerts = function() {
  const prevSos = new Set(lastNotifiedSos);
  _origCheckAlerts2();
  latestData.forEach(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    if (tag.status === "sos" && !prevSos.has(tag.mac) && lastNotifiedSos.has(tag.mac)) {
      speakAlert(`注意！${alias} 發出SOS求救信號`);
    }
  });
};

// ========== 17. 圍欄自動簽到/簽退 ==========
let autoGeofenceLog = JSON.parse(localStorage.getItem("utfind_auto_gf") || "{}");

function checkAutoGeofence() {
  if (geofences.length === 0 || latestData.length === 0) return;

  latestData.forEach(tag => {
    if (tag.lastLatitude == null) return;
    const alias = tagAliases[tag.mac] || tag.mac;
    if (!autoGeofenceLog[tag.mac]) autoGeofenceLog[tag.mac] = {};

    geofences.forEach(gf => {
      const dist = haversine(tag.lastLatitude, tag.lastLongitude, gf.lat, gf.lng) * 1000;
      const inside = dist <= gf.radius;
      const prev = autoGeofenceLog[tag.mac][gf.id];

      if (inside && prev !== "in") {
        autoGeofenceLog[tag.mac][gf.id] = "in";
        addEvent("geofence", `${alias} 進入「${gf.name}」— 自動簽到`);
      } else if (!inside && prev === "in") {
        autoGeofenceLog[tag.mac][gf.id] = "out";
        addEvent("geofence", `${alias} 離開「${gf.name}」— 自動簽退`);
      }
    });
  });
  localStorage.setItem("utfind_auto_gf", JSON.stringify(autoGeofenceLog));
}

// ========== 18. 多租戶白標 ==========
let brandConfig = JSON.parse(localStorage.getItem("utfind_brand") || "{}");

function saveBrandConfig(logoText, primaryColor) {
  brandConfig = { logoText: logoText || "UT", primaryColor: primaryColor || "#3b82f6" };
  localStorage.setItem("utfind_brand", JSON.stringify(brandConfig));
  applyBrand();
}

function applyBrand() {
  if (brandConfig.logoText) {
    const logo = document.querySelector(".nav-logo");
    if (logo) logo.textContent = brandConfig.logoText;
  }
  if (brandConfig.primaryColor) {
    document.documentElement.style.setProperty("--accent", brandConfig.primaryColor);
  }
}

// ========== 19. QR Code 掃碼配對 ==========
function generateQRCode(mac) {
  const alias = tagAliases[mac] || mac;
  const data = JSON.stringify({ mac, alias, platform: "UTFind", ts: Date.now() });
  // 使用 QR Code API 產生圖片
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;

  const win = window.open("", "_blank", "width=320,height=400");
  win.document.write(`<!DOCTYPE html><html><head><title>QR Code - ${alias}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:20px;background:#fff;}
    h2{font-size:16px;color:#333;margin-bottom:4px;} p{font-size:12px;color:#999;}</style></head>
    <body><h2>${alias}</h2><p>${mac}</p><img src="${qrUrl}" alt="QR" style="margin:16px 0;" /><p>掃描此 QR Code 配對裝置</p></body></html>`);
  win.document.close();
}

// ========== 20. 客戶自助查詢入口 ==========
function generateCustomerPortal() {
  if (latestData.length === 0) { showToast("無裝置資料", "warning"); return; }

  const portalData = latestData.map(tag => ({
    name: tagAliases[tag.mac] || tag.mac,
    lat: tag.lastLatitude,
    lng: tag.lastLongitude,
    status: tag.status || "normal",
    battery: tag.lastBatteryLevel,
    temp: tag.temperature,
    time: tag.lastRequestDate,
  }));

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(portalData))));
  const portalUrl = `${location.origin}${location.pathname}?portal=${encoded.slice(0, 50)}...`;

  // 產出唯讀頁面
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>UTFind 貨物追蹤</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>body{margin:0;font-family:sans-serif;}#map{height:60vh;}
    .info{padding:16px;background:#f8fafc;}.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;}
    .card h3{font-size:14px;margin:0 0 4px;} .card p{font-size:12px;color:#666;margin:2px 0;}
    h1{font-size:18px;color:#3b82f6;margin:0 0 12px;} .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}
    .badge.normal{background:#dcfce7;color:#16a34a;} .badge.sos{background:#fee2e2;color:#dc2626;}</style></head>
    <body><div id="map"></div><div class="info"><h1>📦 貨物即時追蹤</h1><div id="cards"></div>
    <p style="color:#999;font-size:10px;margin-top:12px;">由 UTFind IoT Dashboard 提供 · 唯讀檢視</p></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <script>
    const data = ${JSON.stringify(portalData)};
    const map = L.map("map").setView([23.5,121],7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    const bounds = [];
    data.forEach(d => {
      if(d.lat && d.lng){
        L.marker([d.lat,d.lng]).addTo(map).bindPopup("<b>"+d.name+"</b><br>"+d.status);
        bounds.push([d.lat,d.lng]);
      }
    });
    if(bounds.length) map.fitBounds(bounds,{padding:[40,40]});
    document.getElementById("cards").innerHTML = data.map(d =>
      '<div class="card"><h3>'+d.name+' <span class="badge '+(d.status||"normal")+'">'+(d.status==="sos"?"SOS":"正常")+'</span></h3>'+
      '<p>🔋 '+(d.battery||"--")+'% · 🌡 '+(d.temp||"--")+'°C</p>'+
      '<p>📍 '+(d.lat?.toFixed(5)||"--")+', '+(d.lng?.toFixed(5)||"--")+'</p></div>'
    ).join("");
    <\/script></body></html>`);
  win.document.close();
  showToast("已開啟客戶查詢頁面", "success");
  addEvent("info", "產出客戶自助查詢入口");
}

// ========== 版本歷程 ==========
const VERSION_HISTORY = [
  {
    version: "v4.1.0", type: "minor", title: "產業情境 Demo 系統",
    changes: [
      "8 大產業情境一鍵切換（醫院、工地、校園、寵物、租賃、展覽、農業、港口）",
      "每個情境自動載入：品牌主題、地圖標註、圍欄、告警規則、模擬事件",
      "情境切換器 UI — 卡片式選單，點擊即載入",
      "地圖自動跳轉至情境對應位置",
      "一鍵清除情境資料",
    ],
  },
  {
    version: "v4.0.0", type: "major", title: "智慧功能與自動化",
    changes: [
      "AI 行為預測分析（移動模式、風險評估、趨勢預測）",
      "多帳戶切換管理（多組 API Key 快速切換）",
      "自訂儀表板 KPI 拖拉排列（順序自動儲存）",
      "離線模式（斷網自動顯示快取資料 + 黃色提示）",
      "CSV 批次匯入（Tag 別名、群組、圍欄，含範本下載）",
      "告警規則引擎（自訂條件組合 AND/OR，可啟停）",
      "數據比對報告（期間 vs 期間，漲跌箭頭顯示）",
      "地圖 POI 自訂標註（倉庫、門市等圖示標記）",
      "即時共享連結（一次性有時效追蹤 URL）",
      "品牌白標主題（自訂公司名、配色、Logo）",
    ],
  },
  {
    version: "v3.1.0", type: "minor", title: "部署與優化",
    changes: [
      "GitHub + Vercel 自動化部署",
      "Vercel rewrites 取代 Express proxy（免 server 架構）",
      "API 冷卻智慧管控（自動等待 + 倒數顯示）",
      "429 Rate Limit 自動重試（最多 2 次）",
      "自動刷新間隔延長至 120 秒，減少 API 呼叫",
      "查詢軌跡時自動暫停刷新，避免 API 衝突",
      "手動 Tag 功能（加入非帳戶 Tag 追蹤）",
      "Service Worker 快取策略優化（v2，排除 API 路由）",
      "敏感檔案保護（server.js 等重導向）",
      "報表 stat-row 樣式修復",
      "latestData 陣列防護",
    ],
  },
  {
    version: "v3.0.0", type: "major", title: "產業解決方案",
    changes: [
      "GDP/GSP 合規冷鏈報告（含簽章欄位）",
      "溫度逸脫計時器（超過 30 分鐘自動警示）",
      "批號綁定追蹤 + 效期倒數",
      "交接簽收鏈（溫度快照 + 電子紀錄）",
      "多段溫層監控（冷藏/冷凍/常溫）",
      "HACCP 風險矩陣",
      "籠車週轉率分析",
      "門市滯留預警",
      "路線偏離偵測",
      "裝載率估算",
      "到貨 ETA 預測",
      "籠車資產盤點",
      "調度大屏看板",
      "碳足跡計算 + ESG 報告",
      "語音播報警示 (Web Speech API)",
      "圍欄自動簽到/簽退",
      "多租戶白標系統",
      "QR Code 掃碼配對",
      "客戶自助查詢入口",
      "完整版本歷程紀錄",
    ],
  },
  {
    version: "v2.2.0", type: "minor", title: "20 項進階功能",
    changes: [
      "路徑方向箭頭 + 速度色彩漸層",
      "多邊形圍欄",
      "停留點分析",
      "室內平面圖疊加",
      "日/週/月報表",
      "異常行為偵測（夜間移動、電量急降）",
      "電量預測（線性迴歸）",
      "裝置健康評分 (0-100)",
      "角色權限（管理員/操作者/檢視者）",
      "Tag 分組管理",
      "任務指派 + 截止日期",
      "操作稽核日誌",
      "多渠道通知（LINE / Telegram / Webhook）",
      "排程通知",
      "第三方整合（CSV 匯出、IFTTT）",
      "API Webhook 事件回呼",
      "OTA 韌體更新（模擬）",
      "E-Ink 標籤顯示（模擬）",
      "資產生命週期管理",
      "SLA 監控儀表板",
    ],
  },
  {
    version: "v2.1.0", type: "minor", title: "16 項功能擴充",
    changes: [
      "KPI 計數動畫",
      "載入骨架屏",
      "Tag 搜尋過濾",
      "Tag 詳情面板 + Sparkline 圖表",
      "熱力圖圖層",
      "Marker 群集",
      "歷史軌跡速度計算",
      "事件日誌系統",
      "分享位置連結",
      "列印軌跡報告",
      "PWA 離線支援",
      "中/英多語系",
      "通知音效開關",
      "鍵盤快捷鍵",
    ],
  },
  {
    version: "v2.0.0", type: "major", title: "BI Dashboard 重新設計",
    changes: [
      "全新 BI 儀表板介面",
      "左側導航列 + 面板切換",
      "KPI 卡片（在線/SOS/低電量/溫度異常/總數）",
      "Tag 卡片新設計（左色條、電池圖示、感測器數據）",
      "深色/淺色主題 CSS 變數系統",
    ],
  },
  {
    version: "v1.2.0", type: "minor", title: "溫度監控",
    changes: [
      "溫溼度欄位（模擬 2-8°C 範圍）",
      "溫度異常警示 + 音效",
    ],
  },
  {
    version: "v1.1.0", type: "minor", title: "功能擴充",
    changes: [
      "自動刷新（60 秒間隔）",
      "多圖層切換（街道/衛星/地形）",
      "地理圍欄（圓形）",
      "多 Tag 歷史軌跡比對",
      "距離測量工具",
      "地址反查（Nominatim）",
      "Tag 篩選 + 命名",
      "軌跡匯出（CSV/JSON）",
      "軌跡回放動畫",
      "SOS / 低電量通知 + 音效",
    ],
  },
  {
    version: "v1.0.0", type: "major", title: "基礎版",
    changes: [
      "API 連線與金鑰驗證",
      "Leaflet 地圖顯示 Tag 定位",
      "即時位置標記與彈窗資訊",
      "Express 代理伺服器（解決 CORS）",
    ],
  },
];

function renderVersionHistory() {
  const container = document.getElementById("version-history");
  if (!container) return;

  container.innerHTML = VERSION_HISTORY.map(v => `
    <div class="version-entry">
      <span class="version-tag ${v.type}">${v.version}</span>
      <span class="version-title">${v.title}</span>
      <ul class="version-changes">
        ${v.changes.map(c => `<li>${c}</li>`).join("")}
      </ul>
    </div>
  `).join("");
}

// ========== 報表面板初始化 ==========
function refreshReportsPanel() {
  renderHealthScores();
  renderBatteryPrediction();
  renderAnomalyList();
  populateAIPredictSelect();
}

// ========== 群組面板初始化 ==========
function refreshGroupsPanel() {
  populateGroupCheckboxes();
  renderGroupList();
  populateTaskTagSelect();
  renderTaskList();
  renderAssetList();
}

// ========== 設定面板初始化 ==========
function refreshSettingsPanel() {
  renderManualTagList();
  updateRoleDesc();
  loadNotifConfig();
  loadSchedule();
  loadIntegrationConfig();
  loadWebhookConfig();
  renderOTAList();
  populateEinkSelect();
  renderAuditLog();
  renderVersionHistory();
  renderAccountList();
  renderAlertRules();
  loadBrandThemeUI();
}

// ========== 冷鏈面板初始化 ==========
function refreshColdChainPanel() {
  populateColdChainSelects();
  renderExcursionList();
  renderBatchList();
  renderHandoverList();
  renderTempZoneList();
  renderHACCPMatrix();
  renderExpiryCountdown();
}

// ========== 物流面板初始化 ==========
function refreshLogisticsPanel() {
  populateColdChainSelects();
  renderTurnoverRate();
}

// 增強 switchPanel 以在切換時初始化面板
const _origSwitchPanel = switchPanel;
switchPanel = function(name) {
  _origSwitchPanel(name);
  if (name === "reports") refreshReportsPanel();
  if (name === "groups") refreshGroupsPanel();
  if (name === "settings") refreshSettingsPanel();
  if (name === "coldchain") refreshColdChainPanel();
  if (name === "logistics") refreshLogisticsPanel();
};

// 增強 connect 以初始化所有面板
const _origConnect = connect;
connect = async function() {
  await _origConnect();
  drawAllPolyGeofences();
  drawAllPOIs();
  initDraggableKPI();
  populateGroupCheckboxes();
  populateTaskTagSelect();
  populateEinkSelect();
  populateColdChainSelects();
  applyBrand();
};

// 增強 fetchLatest 以觸發冷鏈與物流檢查
const _origFetchLatest = fetchLatest;
fetchLatest = async function() {
  await _origFetchLatest();
  updateExcursionTimers();
  checkAutoGeofence();
};

// 初始化品牌
applyBrand();

// ========== DEMO 假資料（冷鏈 + 物流） ==========
function injectDemoData() {
  // 只在首次或資料為空時注入
  if (Object.keys(batchBindings).length > 0) return;

  const demoMacs = allTags.map(t => t.mac);
  if (demoMacs.length === 0) return;

  const mac1 = demoMacs[0];
  const mac2 = demoMacs[1] || demoMacs[0];

  // 批號綁定
  batchBindings[mac1] = {
    batchNo: "VAX-2026-BNT-0312",
    expiry: "2026-06-30",
    bindDate: new Date(Date.now() - 86400000 * 3).toISOString(),
  };
  batchBindings[mac2] = {
    batchNo: "VAX-2026-MOD-0415",
    expiry: "2026-04-15",
    bindDate: new Date(Date.now() - 86400000 * 7).toISOString(),
  };
  localStorage.setItem("utfind_batches", JSON.stringify(batchBindings));

  // 溫層設定
  tempZones[mac1] = { type: "cold", min: 2, max: 8 };
  tempZones[mac2] = { type: "frozen", min: -25, max: -15 };
  localStorage.setItem("utfind_tempzones", JSON.stringify(tempZones));

  // 溫度逸脫紀錄
  excursionTimers[mac1] = { totalMinutes: 3.2, lastCheck: Date.now(), inExcursion: false };
  excursionTimers[mac2] = { totalMinutes: 18.7, lastCheck: Date.now(), inExcursion: true };
  localStorage.setItem("utfind_excursions", JSON.stringify(excursionTimers));

  // 交接簽收紀錄
  const now = Date.now();
  handoverRecords = [
    { id: "h1", mac: mac1, person: "王大明", time: new Date(now - 3600000 * 5).toISOString(), tempSnapshot: 4.2, location: "25.0330, 121.5654" },
    { id: "h2", mac: mac1, person: "李小華", time: new Date(now - 3600000 * 2).toISOString(), tempSnapshot: 5.1, location: "25.0478, 121.5170" },
    { id: "h3", mac: mac2, person: "張志遠", time: new Date(now - 3600000 * 8).toISOString(), tempSnapshot: -18.3, location: "24.9937, 121.3010" },
    { id: "h4", mac: mac1, person: "陳美玲", time: new Date(now - 3600000 * 0.5).toISOString(), tempSnapshot: 3.8, location: "25.0330, 121.5654" },
    { id: "h5", mac: mac2, person: "林建宏", time: new Date(now - 3600000 * 1).toISOString(), tempSnapshot: -19.5, location: "24.1477, 120.6736" },
  ];
  localStorage.setItem("utfind_handovers", JSON.stringify(handoverRecords));

  // Tag 別名（更擬真）
  if (!tagAliases[mac1]) {
    tagAliases[mac1] = "BNT疫苗-冷藏車A";
    tagAliases[mac2] = "莫德納-冷凍櫃B";
    localStorage.setItem("utfind_aliases", JSON.stringify(tagAliases));
  }

  // Tag 分組
  if (tagGroups.length === 0) {
    tagGroups = [
      { id: "g1", name: "疫苗冷鏈車隊", color: "#3b82f6", macs: [mac1, mac2] },
      { id: "g2", name: "全聯籠車-北區", color: "#22c55e", macs: [mac1] },
      { id: "g3", name: "MOMO 物流車", color: "#f59e0b", macs: [mac2] },
    ];
    localStorage.setItem("utfind_groups", JSON.stringify(tagGroups));
  }

  // 任務指派
  if (tasks.length === 0) {
    tasks = [
      { id: "t1", name: "疫苗配送-台北榮總", mac: mac1, deadline: new Date(Date.now() + 3600000 * 4).toISOString(), status: "active", createdAt: new Date(now - 3600000 * 2).toISOString() },
      { id: "t2", name: "冷凍品配送-台中門市", mac: mac2, deadline: new Date(Date.now() - 3600000 * 1).toISOString(), status: "active", createdAt: new Date(now - 3600000 * 10).toISOString() },
      { id: "t3", name: "籠車回收-新莊倉庫", mac: mac1, deadline: new Date(Date.now() + 86400000).toISOString(), status: "done", createdAt: new Date(now - 86400000).toISOString() },
    ];
    localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
  }

  // 資產狀態
  if (Object.keys(assetLifecycle).length === 0) {
    assetLifecycle[mac1] = "active";
    assetLifecycle[mac2] = "maintenance";
    localStorage.setItem("utfind_assets", JSON.stringify(assetLifecycle));
  }

  // 事件日誌注入歷史事件
  if (eventLog.length < 5) {
    const demoEvents = [
      { type: "connect", icon: "🔗", message: "系統啟動，連線至 API", time: new Date(now - 3600000 * 6).toISOString() },
      { type: "geofence", icon: "📍", message: "BNT疫苗-冷藏車A 進入「台北倉庫」— 自動簽到", time: new Date(now - 3600000 * 5).toISOString() },
      { type: "info", icon: "✍️", message: "王大明 簽收 BNT疫苗-冷藏車A", time: new Date(now - 3600000 * 5).toISOString() },
      { type: "temp", icon: "🌡️", message: "莫德納-冷凍櫃B 溫度逸脫警告 (-12.3°C)", time: new Date(now - 3600000 * 4).toISOString() },
      { type: "geofence", icon: "📍", message: "BNT疫苗-冷藏車A 離開「台北倉庫」— 自動簽退", time: new Date(now - 3600000 * 3).toISOString() },
      { type: "info", icon: "✍️", message: "李小華 簽收 BNT疫苗-冷藏車A", time: new Date(now - 3600000 * 2).toISOString() },
      { type: "lowbat", icon: "🔋", message: "莫德納-冷凍櫃B 電量不足 (18%)", time: new Date(now - 3600000 * 1.5).toISOString() },
      { type: "sos", icon: "🚨", message: "BNT疫苗-冷藏車A 發出 SOS 求救！(模擬)", time: new Date(now - 3600000 * 0.5).toISOString() },
      { type: "info", icon: "📊", message: "產出每日使用報表", time: new Date(now - 1800000).toISOString() },
      { type: "geofence", icon: "📍", message: "BNT疫苗-冷藏車A 進入「台北榮總」— 自動簽到", time: new Date(now - 600000).toISOString() },
    ];
    eventLog = demoEvents.concat(eventLog);
    localStorage.setItem("utfind_events", JSON.stringify(eventLog));
  }

  // 模擬 tempHistory / batHistory（sparkline 用）
  demoMacs.forEach(mac => {
    if (!tempHistory[mac] || tempHistory[mac].length < 5) {
      tempHistory[mac] = [];
      batHistory[mac] = [];
      let t = mac === mac2 ? -20 : 4;
      let b = 85;
      for (let i = 0; i < 15; i++) {
        t += (Math.random() - 0.5) * 2;
        b -= Math.random() * 2;
        tempHistory[mac].push(parseFloat(t.toFixed(1)));
        batHistory[mac].push(Math.max(10, Math.round(b)));
      }
    }
  });

  console.log("✅ Demo 假資料已注入");
}

// 增強 connect：連線成功後注入 demo 資料
const _origConnect2 = connect;
connect = async function() {
  await _origConnect2();
  if (allTags.length > 0) injectDemoData();
};

// ========== 多帳戶切換 ==========
let savedAccounts = JSON.parse(localStorage.getItem("utfind_accounts") || "[]");

function addAccount() {
  const name = document.getElementById("account-name").value.trim();
  const key = document.getElementById("account-key").value.trim();
  if (!name || !key) { showToast("請填入帳戶名稱和 API Key", "warning"); return; }
  if (savedAccounts.find(a => a.key === key)) { showToast("此 Key 已存在", "info"); return; }
  savedAccounts.push({ name, key, addedAt: new Date().toISOString() });
  localStorage.setItem("utfind_accounts", JSON.stringify(savedAccounts));
  document.getElementById("account-name").value = "";
  document.getElementById("account-key").value = "";
  renderAccountList();
  showToast(`已新增帳戶: ${name}`, "success");
}

function switchAccount(key) {
  document.getElementById("api-key").value = key;
  renderAccountList();
  showToast("已切換帳戶，請按連線", "info");
}

function removeAccount(key) {
  savedAccounts = savedAccounts.filter(a => a.key !== key);
  localStorage.setItem("utfind_accounts", JSON.stringify(savedAccounts));
  renderAccountList();
}

function renderAccountList() {
  const container = document.getElementById("account-list");
  if (!container) return;
  if (savedAccounts.length === 0) { container.innerHTML = '<div class="empty-state">尚未新增帳戶</div>'; return; }
  const currentKey = document.getElementById("api-key").value.trim();
  container.innerHTML = savedAccounts.map(a => `
    <div class="account-item ${a.key === currentKey ? 'active-account' : ''}" onclick="switchAccount('${a.key}')">
      <div>
        <div class="account-name">${a.name}</div>
        <div class="account-key">${a.key.slice(0,3)}***${a.key.slice(-2)}</div>
      </div>
      <button class="btn-ghost-sm" onclick="event.stopPropagation();removeAccount('${a.key}')">移除</button>
    </div>
  `).join("");
}

// ========== 告警規則引擎 ==========
let alertRules = JSON.parse(localStorage.getItem("utfind_alert_rules") || "[]");

function saveAlertRule() {
  const name = document.getElementById("rule-name").value.trim();
  const condA = document.getElementById("rule-cond-a").value;
  const condB = document.getElementById("rule-cond-b").value;
  const logic = document.getElementById("rule-logic").value;
  const threshold = parseFloat(document.getElementById("rule-threshold").value) || 20;
  if (!name) { showToast("請輸入規則名稱", "warning"); return; }
  alertRules.push({ id: Date.now().toString(), name, condA, condB, logic, threshold, enabled: true });
  localStorage.setItem("utfind_alert_rules", JSON.stringify(alertRules));
  document.getElementById("rule-name").value = "";
  renderAlertRules();
  showToast(`規則「${name}」已建立`, "success");
}

function removeAlertRule(id) {
  alertRules = alertRules.filter(r => r.id !== id);
  localStorage.setItem("utfind_alert_rules", JSON.stringify(alertRules));
  renderAlertRules();
}

function toggleAlertRule(id) {
  const rule = alertRules.find(r => r.id === id);
  if (rule) { rule.enabled = !rule.enabled; localStorage.setItem("utfind_alert_rules", JSON.stringify(alertRules)); renderAlertRules(); }
}

function checkCondition(tag, cond, threshold) {
  switch(cond) {
    case "temp_high": return tag.temperature != null && tag.temperature > TEMP_MAX;
    case "temp_low": return tag.temperature != null && tag.temperature < TEMP_MIN;
    case "bat_low": return tag.lastBatteryLevel != null && tag.lastBatteryLevel < threshold;
    case "sos": return tag.status === "sos";
    case "offline": return !tag.lastRequestDate || (Date.now() - new Date(tag.lastRequestDate).getTime()) > threshold * 60000;
    case "geofence_out": return false; // handled elsewhere
    default: return false;
  }
}

function evaluateAlertRules() {
  alertRules.filter(r => r.enabled).forEach(rule => {
    latestData.forEach(tag => {
      const a = checkCondition(tag, rule.condA, rule.threshold);
      const b = rule.condB ? checkCondition(tag, rule.condB, rule.threshold) : false;
      const triggered = rule.condB ? (rule.logic === "and" ? a && b : a || b) : a;
      if (triggered) {
        const alias = tagAliases[tag.mac] || tag.mac;
        addEvent("rule", `規則「${rule.name}」觸發: ${alias}`);
      }
    });
  });
}

function renderAlertRules() {
  const container = document.getElementById("alert-rules-list");
  if (!container) return;
  if (alertRules.length === 0) { container.innerHTML = '<div class="empty-state">尚未建立規則</div>'; return; }
  const condLabels = { temp_high: "溫度>上限", temp_low: "溫度<下限", bat_low: "電量<閾值", sos: "SOS", offline: "離線", geofence_out: "離開圍欄" };
  container.innerHTML = alertRules.map(r => `
    <div class="rule-item">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="rule-name">${r.name}</div>
        <div>
          <span class="rule-status rule-active">${r.enabled ? "啟用" : "停用"}</span>
          <button class="btn-ghost-sm" onclick="toggleAlertRule('${r.id}')">${r.enabled ? "停用" : "啟用"}</button>
          <button class="btn-ghost-sm" onclick="removeAlertRule('${r.id}')">刪除</button>
        </div>
      </div>
      <div class="rule-desc">${condLabels[r.condA] || r.condA}${r.condB ? ` ${r.logic === 'and' ? '且' : '或'} ${condLabels[r.condB]}` : ""} · 閾值: ${r.threshold}</div>
    </div>
  `).join("");
}

// ========== 批次 CSV 匯入 ==========
function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const type = document.getElementById("import-type").value;
  const status = document.getElementById("import-status");
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split("\n").filter(l => l.trim());
    let count = 0;
    if (type === "aliases") {
      lines.forEach(line => {
        const [mac, name] = line.split(",").map(s => s.trim());
        if (mac && name) { tagAliases[mac] = name; count++; }
      });
      localStorage.setItem("utfind_aliases", JSON.stringify(tagAliases));
    } else if (type === "groups") {
      lines.forEach(line => {
        const [name, macsStr] = line.split(",").map(s => s.trim());
        if (name && macsStr) {
          const macs = macsStr.split(";").map(s => s.trim()).filter(Boolean);
          tagGroups.push({ id: Date.now().toString() + count, name, color: "#3b82f6", macs });
          count++;
        }
      });
      localStorage.setItem("utfind_groups", JSON.stringify(tagGroups));
    } else if (type === "geofences") {
      lines.forEach(line => {
        const parts = line.split(",").map(s => s.trim());
        if (parts.length >= 4) {
          geofences.push({ name: parts[0], lat: parseFloat(parts[1]), lng: parseFloat(parts[2]), radius: parseInt(parts[3]) || 500 });
          count++;
        }
      });
      localStorage.setItem("utfind_geofences", JSON.stringify(geofences));
      renderGeofenceList();
      drawAllGeofences();
    }
    status.className = "status success";
    status.textContent = `成功匯入 ${count} 筆資料`;
    showToast(`CSV 匯入完成: ${count} 筆`, "success");
    event.target.value = "";
  };
  reader.readAsText(file);
}

function downloadCSVTemplate() {
  const type = document.getElementById("import-type").value;
  let content = "";
  if (type === "aliases") content = "F1:4D:07:A1:2A:74,疫苗冷藏車A\nDD:00:11:22:33:44,倉庫門禁";
  else if (type === "groups") content = "車隊A,F1:4D:07:A1:2A:74;DD:00:11:22:33:44\n冷鏈組,AB:CD:EF:12:34:56";
  else if (type === "geofences") content = "台北倉庫,25.0330,121.5654,500\n高雄門市,22.6273,120.3014,300";
  const blob = new Blob([content], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `utfind_${type}_template.csv`;
  a.click();
}

// ========== 品牌白標主題 ==========
let brandTheme = JSON.parse(localStorage.getItem("utfind_brand_theme") || "null");

function saveBrandTheme() {
  const company = document.getElementById("brand-company").value.trim();
  const primary = document.getElementById("brand-primary").value;
  const accent = document.getElementById("brand-accent").value;
  const logoUrl = document.getElementById("brand-logo-url").value.trim();
  const logoImage = brandTheme?.logoImage || "";
  brandTheme = { company, primary, accent, logoUrl, logoImage };
  localStorage.setItem("utfind_brand_theme", JSON.stringify(brandTheme));
  applyBrandTheme();
  showToast("品牌主題已套用", "success");
}

function handleLogoUpload(event) {
  const file = event.target.files?.[0] || event.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 2 * 1024 * 1024) { showToast("圖片大小不能超過 2MB", "error"); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    if (!brandTheme) brandTheme = {};
    brandTheme.logoImage = base64;
    updateLogoPreview(base64);
    showToast("Logo 已上傳，點擊「套用主題」儲存", "info");
  };
  reader.readAsDataURL(file);
}

function updateLogoPreview(src) {
  const preview = document.getElementById("brand-logo-preview");
  if (!preview) return;
  if (src) {
    preview.innerHTML = `<img src="${src}" alt="Logo" /><span style="font-size:10px;color:var(--text-muted);cursor:pointer;" onclick="event.stopPropagation();clearLogoImage()">移除圖片</span>`;
  } else {
    preview.innerHTML = `<span style="font-size:24px;color:var(--text-muted);">+</span><span style="font-size:10px;color:var(--text-muted);">點擊或拖曳圖片上傳</span>`;
  }
}

function clearLogoImage() {
  if (brandTheme) { brandTheme.logoImage = ""; }
  updateLogoPreview("");
  const fileInput = document.getElementById("brand-logo-file");
  if (fileInput) fileInput.value = "";
}

// Logo 拖曳上傳
document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("brand-logo-drop");
  if (!dropZone) return;
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("drag-over"); });
  dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.classList.remove("drag-over"); handleLogoUpload(e); });
});

function resetBrandTheme() {
  brandTheme = null;
  localStorage.removeItem("utfind_brand_theme");
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--accent-hover");
  const logo = document.querySelector(".nav-logo");
  if (logo) { logo.innerHTML = "UT"; logo.style.background = ""; }
  const headerLogo = document.getElementById("brand-header-logo");
  if (headerLogo) { headerLogo.innerHTML = ""; headerLogo.style.display = "none"; }
  document.title = "UTFind — IoT Tag Dashboard";
  updateLogoPreview("");
  const fileInput = document.getElementById("brand-logo-file");
  if (fileInput) fileInput.value = "";
  showToast("已重置為預設主題", "info");
}

function applyBrandTheme() {
  if (!brandTheme) return;
  if (brandTheme.primary) {
    document.documentElement.style.setProperty("--accent", brandTheme.primary);
    document.documentElement.style.setProperty("--accent-hover", brandTheme.accent || brandTheme.primary);
  }
  const logo = document.querySelector(".nav-logo");
  if (logo) {
    if (brandTheme.logoImage) {
      logo.innerHTML = `<img src="${brandTheme.logoImage}" alt="Logo" />`;
    } else if (brandTheme.company) {
      logo.innerHTML = brandTheme.company.slice(0, 2).toUpperCase();
    }
  }
  // 更新面板 header 的品牌 logo
  const headerLogo = document.getElementById("brand-header-logo");
  if (headerLogo) {
    if (brandTheme.logoImage || brandTheme.company) {
      let html = "";
      if (brandTheme.logoImage) html += `<img src="${brandTheme.logoImage}" alt="Logo" />`;
      if (brandTheme.company) html += `<span class="brand-header-name">${brandTheme.company}</span>`;
      headerLogo.innerHTML = html;
      headerLogo.style.display = "flex";
    } else {
      headerLogo.style.display = "none";
    }
  }
  if (brandTheme.company) {
    document.title = `${brandTheme.company} — IoT Dashboard`;
  }
}

function loadBrandThemeUI() {
  if (!brandTheme) return;
  const el = (id) => document.getElementById(id);
  if (el("brand-company")) el("brand-company").value = brandTheme.company || "";
  if (el("brand-primary")) el("brand-primary").value = brandTheme.primary || "#3b82f6";
  if (el("brand-accent")) el("brand-accent").value = brandTheme.accent || "#8b5cf6";
  if (el("brand-logo-url")) el("brand-logo-url").value = brandTheme.logoUrl || "";
  if (brandTheme.logoImage) updateLogoPreview(brandTheme.logoImage);
}

// 頁面載入時套用品牌主題
applyBrandTheme();

// ========== AI 行為預測 ==========
function populateAIPredictSelect() {
  const sel = document.getElementById("ai-predict-tag");
  if (!sel || allTags.length === 0) return;
  sel.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<option value="${t.mac}">${t.mac}${alias}</option>`;
  }).join("");
}

function runAIPrediction() {
  const mac = document.getElementById("ai-predict-tag")?.value;
  const output = document.getElementById("ai-prediction-output");
  if (!mac || !output) return;
  const tag = latestData.find(t => t.mac === mac);
  if (!tag) { output.innerHTML = '<div class="empty-state">找不到此 Tag 資料</div>'; return; }

  const alias = tagAliases[mac] || mac;
  const temps = tempHistory[mac] || [];
  const bats = batHistory[mac] || [];

  // 移動模式分析
  let movePattern = "固定不動";
  let confidence = 85;
  if (tag.lastRequestDate) {
    const ageH = (Date.now() - new Date(tag.lastRequestDate).getTime()) / 3600000;
    if (ageH < 1) { movePattern = "活躍移動中"; confidence = 92; }
    else if (ageH < 6) { movePattern = "間歇移動"; confidence = 78; }
    else { movePattern = "靜止 / 離線"; confidence = 65; }
  }

  // 溫度趨勢
  let tempTrend = "穩定";
  if (temps.length >= 3) {
    const recent = temps.slice(-3);
    const diff = recent[recent.length - 1] - recent[0];
    if (diff > 1) tempTrend = "上升趨勢 ↑";
    else if (diff < -1) tempTrend = "下降趨勢 ↓";
  }

  // 電量預測
  let batPrediction = "資料不足";
  if (bats.length >= 2) {
    const drop = bats[0] - bats[bats.length - 1];
    const rate = drop / bats.length;
    if (rate <= 0) batPrediction = "電量穩定，無需擔心";
    else {
      const remaining = (tag.lastBatteryLevel || 50) / rate;
      const days = Math.round(remaining * AUTO_REFRESH_INTERVAL / 86400);
      batPrediction = `預估 ${days} 天後需充電`;
    }
  }

  // 異常風險
  let riskLevel = "低";
  let riskColor = "#22c55e";
  let riskScore = 15;
  if (tag.status === "sos") { riskLevel = "極高"; riskColor = "#ef4444"; riskScore = 95; }
  else if (tag.temperature && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX)) { riskLevel = "高"; riskColor = "#f59e0b"; riskScore = 72; }
  else if (tag.lastBatteryLevel && tag.lastBatteryLevel < 20) { riskLevel = "中"; riskColor = "#f59e0b"; riskScore = 45; }

  output.innerHTML = `
    <div class="prediction-card">
      <div class="prediction-header">🤖 ${alias} 行為分析</div>
      <div class="prediction-row"><span class="prediction-label">移動模式</span><span class="prediction-value">${movePattern}</span></div>
      <div class="prediction-row"><span class="prediction-label">預測信心度</span><span class="prediction-value">${confidence}%</span></div>
      <div class="prediction-bar"><div class="prediction-bar-fill" style="width:${confidence}%"></div></div>
    </div>
    <div class="prediction-card">
      <div class="prediction-header">📊 趨勢預測</div>
      <div class="prediction-row"><span class="prediction-label">溫度趨勢</span><span class="prediction-value">${tempTrend}</span></div>
      <div class="prediction-row"><span class="prediction-label">電量預測</span><span class="prediction-value">${batPrediction}</span></div>
      <div class="prediction-row"><span class="prediction-label">下次回報</span><span class="prediction-value">≈ ${AUTO_REFRESH_INTERVAL} 秒後</span></div>
    </div>
    <div class="prediction-card">
      <div class="prediction-header">⚠️ 風險評估</div>
      <div class="prediction-row"><span class="prediction-label">異常風險</span><span class="prediction-value" style="color:${riskColor};">${riskLevel} (${riskScore}/100)</span></div>
      <div class="prediction-bar"><div class="prediction-bar-fill" style="width:${riskScore}%;background:${riskColor};"></div></div>
    </div>
  `;
}

// ========== 數據比對報告 ==========
function generateCompareReport() {
  const output = document.getElementById("compare-output");
  if (!output || latestData.length === 0) { if (output) output.innerHTML = '<div class="empty-state">請先連線取得資料</div>'; return; }

  const periodA = document.getElementById("compare-period-a").value;
  const periodB = document.getElementById("compare-period-b").value;
  const labels = { today: "今天", yesterday: "昨天", thisweek: "本週", lastweek: "上週", thismonth: "本月", lastmonth: "上月" };

  // 使用目前資料模擬（真實應比對歷史 API，但受限於 30 秒冷卻）
  const total = latestData.length;
  const online = latestData.filter(t => t.lastRequestDate && (Date.now() - new Date(t.lastRequestDate).getTime()) < 3600000).length;
  const avgBat = Math.round(latestData.reduce((s, t) => s + (t.lastBatteryLevel || 0), 0) / Math.max(total, 1));
  const avgTemp = parseFloat((latestData.filter(t => t.temperature != null).reduce((s, t) => s + t.temperature, 0) / Math.max(latestData.filter(t => t.temperature != null).length, 1)).toFixed(1));
  const sos = latestData.filter(t => t.status === "sos").length;
  const tempAlert = latestData.filter(t => t.temperature != null && (t.temperature < TEMP_MIN || t.temperature > TEMP_MAX)).length;

  // 模擬期間 B 資料（加入隨機變化）
  const rand = (v, pct) => Math.round(v * (1 + (Math.random() - 0.5) * pct));
  const bOnline = rand(online, 0.3);
  const bAvgBat = rand(avgBat, 0.1);
  const bAvgTemp = parseFloat((avgTemp + (Math.random() - 0.5) * 2).toFixed(1));
  const bSos = rand(sos, 0.5);
  const bTempAlert = rand(tempAlert, 0.4);

  function diffHTML(a, b) {
    const d = a - b;
    if (d === 0) return '<span class="compare-same">—</span>';
    const arrow = d > 0 ? "↑" : "↓";
    const cls = d > 0 ? "compare-up" : "compare-down";
    return `<span class="${cls}">${arrow} ${Math.abs(d)}</span>`;
  }

  output.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">📊 ${labels[periodA]} vs ${labels[periodB]}</div>
    <div class="compare-row"><span class="compare-label">在線裝置</span><span class="compare-val">${online}</span><span class="compare-val">${bOnline}</span><span class="compare-diff">${diffHTML(online, bOnline)}</span></div>
    <div class="compare-row"><span class="compare-label">平均電量</span><span class="compare-val">${avgBat}%</span><span class="compare-val">${bAvgBat}%</span><span class="compare-diff">${diffHTML(avgBat, bAvgBat)}</span></div>
    <div class="compare-row"><span class="compare-label">平均溫度</span><span class="compare-val">${avgTemp}°C</span><span class="compare-val">${bAvgTemp}°C</span><span class="compare-diff">${diffHTML(avgTemp, bAvgTemp)}</span></div>
    <div class="compare-row"><span class="compare-label">SOS 事件</span><span class="compare-val">${sos}</span><span class="compare-val">${bSos}</span><span class="compare-diff">${diffHTML(sos, bSos)}</span></div>
    <div class="compare-row"><span class="compare-label">溫度異常</span><span class="compare-val">${tempAlert}</span><span class="compare-val">${bTempAlert}</span><span class="compare-diff">${diffHTML(tempAlert, bTempAlert)}</span></div>
  `;
}

// ========== 地圖自訂標註 (POI) ==========
let pois = JSON.parse(localStorage.getItem("utfind_pois") || "[]");
let poiMarkers = {};
let poiPickMode = false;
let poiPickLatLng = null;

function startPOIPick() {
  poiPickMode = true;
  document.getElementById("btn-poi-pick").textContent = "在地圖上點擊...";
  showToast("請在地圖上點擊選取位置", "info");
}

function savePOI() {
  const name = document.getElementById("poi-name").value.trim();
  const icon = document.getElementById("poi-icon").value;
  if (!name) { showToast("請輸入標註名稱", "warning"); return; }
  if (!poiPickLatLng) { showToast("請先在地圖上選取位置", "warning"); return; }
  const poi = { id: Date.now().toString(), name, icon, lat: poiPickLatLng.lat, lng: poiPickLatLng.lng };
  pois.push(poi);
  localStorage.setItem("utfind_pois", JSON.stringify(pois));
  addPOIMarker(poi);
  renderPOIList();
  document.getElementById("poi-name").value = "";
  poiPickLatLng = null;
  document.getElementById("btn-poi-pick").textContent = "點擊地圖選取";
  showToast(`已新增標註: ${name}`, "success");
}

function addPOIMarker(poi) {
  const icon = L.divIcon({ className: "", html: `<div class="poi-marker">${poi.icon}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
  const m = L.marker([poi.lat, poi.lng], { icon }).addTo(map);
  m.bindTooltip(poi.name, { className: "poi-label", direction: "top", offset: [0, -10] });
  poiMarkers[poi.id] = m;
}

function removePOI(id) {
  if (poiMarkers[id]) { map.removeLayer(poiMarkers[id]); delete poiMarkers[id]; }
  pois = pois.filter(p => p.id !== id);
  localStorage.setItem("utfind_pois", JSON.stringify(pois));
  renderPOIList();
}

function renderPOIList() {
  const container = document.getElementById("poi-list");
  if (!container) return;
  if (pois.length === 0) { container.innerHTML = '<div class="empty-state">尚未新增標註</div>'; return; }
  container.innerHTML = pois.map(p => `
    <div class="geofence-item">
      <div><span>${p.icon}</span> <strong>${p.name}</strong> <span style="font-size:10px;color:var(--text-muted);">(${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})</span></div>
      <button class="btn-ghost-sm" onclick="removePOI('${p.id}')">移除</button>
    </div>
  `).join("");
}

function drawAllPOIs() {
  pois.forEach(poi => addPOIMarker(poi));
}

// ========== 即時共享連結 ==========
function populateShareSelect() {
  const sel = document.getElementById("share-tag-select");
  if (!sel || allTags.length === 0) return;
  sel.innerHTML = '<option value="all">所有裝置</option>' + allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<option value="${t.mac}">${t.mac}${alias}</option>`;
  }).join("");
}

function generateShareLink() {
  const mac = document.getElementById("share-tag-select")?.value || "all";
  const hours = parseInt(document.getElementById("share-duration")?.value) || 24;
  const output = document.getElementById("share-link-output");
  if (!output) return;

  const shareData = {
    mac, hours, created: Date.now(), expires: Date.now() + hours * 3600000,
    key: apiKey.slice(0, 4) + "****"
  };
  const encoded = btoa(JSON.stringify(shareData));
  const shareUrl = `${location.origin}${location.pathname}#share=${encoded}`;

  output.className = "";
  output.innerHTML = `
    <div class="share-link-box" onclick="navigator.clipboard.writeText('${shareUrl}');showToast('已複製到剪貼簿','success');">
      ${shareUrl}
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">有效期限: ${hours} 小時 · 點擊連結可複製</div>
  `;
  showToast("分享連結已產生", "success");
}

// ========== 離線模式 ==========
function updateOnlineStatus() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  if (!navigator.onLine) {
    banner.classList.add("show");
    // 從 localStorage 載入快取的最後資料
    const cached = localStorage.getItem("utfind_latest_cache");
    if (cached && latestData.length === 0) {
      try {
        latestData = JSON.parse(cached);
        renderTagList();
        updateMarkers();
        updateDashboard();
        showToast("已載入離線快取資料", "info");
      } catch(e) {}
    }
  } else {
    banner.classList.remove("show");
  }
}

function cacheLatestData() {
  if (latestData.length > 0) {
    localStorage.setItem("utfind_latest_cache", JSON.stringify(latestData));
  }
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// ========== 自訂儀表板 KPI 排列 ==========
let kpiOrder = JSON.parse(localStorage.getItem("utfind_kpi_order") || "null");

function initDraggableKPI() {
  const grid = document.getElementById("kpi-grid");
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll(".kpi-card"));

  // 載入儲存的順序
  if (kpiOrder && kpiOrder.length === cards.length) {
    const fragment = document.createDocumentFragment();
    kpiOrder.forEach(idx => { if (cards[idx]) fragment.appendChild(cards[idx]); });
    grid.appendChild(fragment);
  }

  cards.forEach(card => {
    card.setAttribute("draggable", "true");
    card.style.cursor = "grab";
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", Array.from(grid.children).indexOf(card));
      card.style.opacity = "0.5";
    });
    card.addEventListener("dragend", () => { card.style.opacity = "1"; });
    card.addEventListener("dragover", (e) => { e.preventDefault(); card.style.borderColor = "var(--accent)"; });
    card.addEventListener("dragleave", () => { card.style.borderColor = ""; });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.style.borderColor = "";
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
      const toIdx = Array.from(grid.children).indexOf(card);
      const children = Array.from(grid.children);
      if (fromIdx !== toIdx && children[fromIdx]) {
        grid.insertBefore(children[fromIdx], fromIdx < toIdx ? card.nextSibling : card);
        // 儲存順序
        kpiOrder = Array.from(grid.children).map(c => cards.indexOf(c));
        localStorage.setItem("utfind_kpi_order", JSON.stringify(kpiOrder));
      }
    });
  });
}

// ========== 產業情境 Demo ==========
const SCENARIOS = {
  hospital: {
    name: "醫院/長照",
    icon: "🏥",
    brand: { company: "台北榮民總醫院", primary: "#0891b2", accent: "#06b6d4" },
    aliases: { TAG1: "輪椅 A-01", TAG2: "AED 急救器 #3" },
    pois: [
      { name: "急診室", icon: "🚑", lat: 25.1215, lng: 121.5194 },
      { name: "護理站 2F", icon: "🏥", lat: 25.1218, lng: 121.5197 },
      { name: "復健中心", icon: "♿", lat: 25.1212, lng: 121.5191 },
      { name: "藥局", icon: "💊", lat: 25.1220, lng: 121.5200 }
    ],
    geofences: [
      { name: "院區範圍", lat: 25.1216, lng: 121.5196, radius: 300 },
      { name: "管制區-加護病房", lat: 25.1219, lng: 121.5199, radius: 50 }
    ],
    groups: [
      { name: "輪椅組", color: "#0891b2" },
      { name: "急救設備", color: "#ef4444" }
    ],
    rules: [
      { name: "設備離開院區", condA: "geofence_out", condB: "", logic: "or", threshold: 20 },
      { name: "AED 低電量", condA: "bat_low", condB: "", logic: "or", threshold: 30 }
    ],
    events: [
      { type: "info", icon: "♿", message: "輪椅 A-01 已從 3F 護理站借出 — 張護理師" },
      { type: "info", icon: "✅", message: "輪椅 A-03 已歸還至 1F 大廳" },
      { type: "warning", icon: "🔋", message: "AED 急救器 #3 電量不足 (18%)，請立即更換電池" },
      { type: "geofence", icon: "🚨", message: "點滴架 B-05 離開管制區-加護病房" },
      { type: "info", icon: "📊", message: "今日設備使用率: 輪椅 78%、點滴架 92%" }
    ]
  },
  construction: {
    name: "營建工地",
    icon: "🏗️",
    brand: { company: "宏大營造", primary: "#d97706", accent: "#f59e0b" },
    aliases: { TAG1: "挖土機 CAT-320", TAG2: "工具箱 T-12" },
    pois: [
      { name: "工務所", icon: "🏢", lat: 25.0478, lng: 121.5170 },
      { name: "材料堆放區", icon: "📦", lat: 25.0482, lng: 121.5175 },
      { name: "危險區域-基坑", icon: "⚠️", lat: 25.0475, lng: 121.5168 },
      { name: "出入口", icon: "🚏", lat: 25.0485, lng: 121.5178 }
    ],
    geofences: [
      { name: "工地範圍", lat: 25.0480, lng: 121.5172, radius: 200 },
      { name: "危險區域-基坑", lat: 25.0475, lng: 121.5168, radius: 30 }
    ],
    groups: [
      { name: "重型機具", color: "#d97706" },
      { name: "手工具箱", color: "#84cc16" }
    ],
    rules: [
      { name: "機具離開工地", condA: "geofence_out", condB: "", logic: "or", threshold: 20 },
      { name: "人員進入危險區域", condA: "geofence_out", condB: "sos", logic: "or", threshold: 10 }
    ],
    events: [
      { type: "info", icon: "🏗️", message: "挖土機 CAT-320 啟動作業 — 08:05" },
      { type: "info", icon: "🔧", message: "工具箱 T-12 已借出 — 王班長" },
      { type: "warning", icon: "⚠️", message: "工人 W-003 進入基坑危險區域！" },
      { type: "info", icon: "📋", message: "今日出勤打卡: 已到 23 人 / 預計 25 人" },
      { type: "info", icon: "📊", message: "挖土機今日使用率: 6.5 小時 (81%)" }
    ]
  },
  school: {
    name: "學校/校園",
    icon: "🏫",
    brand: { company: "台北市立大安國小", primary: "#2563eb", accent: "#3b82f6" },
    aliases: { TAG1: "校車 A 線", TAG2: "校車 B 線" },
    pois: [
      { name: "校門口", icon: "🏫", lat: 25.0265, lng: 121.5435 },
      { name: "操場", icon: "🏃", lat: 25.0262, lng: 121.5430 },
      { name: "接送區", icon: "🚐", lat: 25.0268, lng: 121.5438 },
      { name: "安親班", icon: "📚", lat: 25.0270, lng: 121.5440 }
    ],
    geofences: [
      { name: "校園範圍", lat: 25.0265, lng: 121.5435, radius: 150 },
      { name: "接送安全區", lat: 25.0268, lng: 121.5438, radius: 50 }
    ],
    groups: [
      { name: "校車", color: "#2563eb" },
      { name: "學童手環", color: "#f472b6" }
    ],
    rules: [
      { name: "學童離開校園", condA: "geofence_out", condB: "", logic: "or", threshold: 10 },
      { name: "校車偏離路線", condA: "geofence_out", condB: "", logic: "or", threshold: 15 }
    ],
    events: [
      { type: "info", icon: "🚐", message: "校車 A 線 已從學校出發 — 15:30" },
      { type: "geofence", icon: "📍", message: "校車 A 線 到達站點「忠孝東路口」" },
      { type: "info", icon: "👋", message: "小明 已到校 — 家長已收到通知" },
      { type: "warning", icon: "⚠️", message: "校車 B 線 偏離預定路線 350m" },
      { type: "info", icon: "📊", message: "今日到校率: 98.5% (197/200)" }
    ]
  },
  pet: {
    name: "寵物/畜牧",
    icon: "🐾",
    brand: { company: "寵愛追蹤", primary: "#ec4899", accent: "#f472b6" },
    aliases: { TAG1: "柴犬-小橘", TAG2: "牧場牛 #A27" },
    pois: [
      { name: "寵物公園", icon: "🌳", lat: 25.0330, lng: 121.5590 },
      { name: "動物醫院", icon: "🏥", lat: 25.0335, lng: 121.5595 },
      { name: "牧場", icon: "🐄", lat: 24.9580, lng: 121.2340 },
      { name: "飼料倉", icon: "🌾", lat: 24.9575, lng: 121.2335 }
    ],
    geofences: [
      { name: "小橘活動範圍", lat: 25.0330, lng: 121.5590, radius: 500 },
      { name: "牧場範圍", lat: 24.9580, lng: 121.2340, radius: 1000 }
    ],
    groups: [
      { name: "家庭寵物", color: "#ec4899" },
      { name: "牧場牲畜", color: "#84cc16" }
    ],
    rules: [
      { name: "寵物走失告警", condA: "geofence_out", condB: "", logic: "or", threshold: 10 },
      { name: "牛隻離開牧場", condA: "geofence_out", condB: "", logic: "or", threshold: 30 }
    ],
    events: [
      { type: "warning", icon: "🐕", message: "小橘 離開活動範圍 200m！飼主已通知" },
      { type: "info", icon: "🐾", message: "小橘 今日行走 3.2 km，活動量正常" },
      { type: "info", icon: "🐄", message: "牧場牛 #A27 今日活動範圍正常" },
      { type: "info", icon: "💤", message: "小橘 已靜止超過 2 小時 — 可能在休息" },
      { type: "info", icon: "📊", message: "牧場巡牧完成: 全數 45 頭牛在範圍內" }
    ]
  },
  rental: {
    name: "租賃業",
    icon: "🚗",
    brand: { company: "速達租車", primary: "#7c3aed", accent: "#8b5cf6" },
    aliases: { TAG1: "Toyota Altis #A12", TAG2: "共享單車 B-088" },
    pois: [
      { name: "台北租車站", icon: "🚗", lat: 25.0478, lng: 121.5170 },
      { name: "板橋還車點", icon: "🅿️", lat: 25.0145, lng: 121.4635 },
      { name: "單車站 A", icon: "🚲", lat: 25.0340, lng: 121.5450 },
      { name: "維修中心", icon: "🔧", lat: 25.0500, lng: 121.5200 }
    ],
    geofences: [
      { name: "台北營業區", lat: 25.0400, lng: 121.5300, radius: 15000 },
      { name: "禁止區域-高速公路", lat: 25.0600, lng: 121.5000, radius: 500 }
    ],
    groups: [
      { name: "租賃汽車", color: "#7c3aed" },
      { name: "共享單車", color: "#06b6d4" }
    ],
    rules: [
      { name: "車輛離開營業區", condA: "geofence_out", condB: "", logic: "or", threshold: 20 },
      { name: "單車低電量", condA: "bat_low", condB: "", logic: "or", threshold: 15 }
    ],
    events: [
      { type: "info", icon: "🚗", message: "Toyota Altis #A12 已租出 — 客戶:陳先生，預計 3 天" },
      { type: "info", icon: "🔄", message: "共享單車 B-088 已歸還至板橋站" },
      { type: "warning", icon: "⚠️", message: "Toyota Altis #A12 逾時未歸還 (已超 2 小時)" },
      { type: "info", icon: "💰", message: "今日營收: 租車 $12,500 / 單車 $3,200" },
      { type: "info", icon: "📊", message: "車隊使用率: 汽車 85% / 單車 72%" }
    ]
  },
  exhibition: {
    name: "展覽/活動",
    icon: "🎪",
    brand: { company: "台北國際展覽", primary: "#dc2626", accent: "#ef4444" },
    aliases: { TAG1: "VIP 貴賓 A", TAG2: "展品箱 #E05" },
    pois: [
      { name: "主舞台", icon: "🎤", lat: 25.0340, lng: 121.6150 },
      { name: "展區 A-科技", icon: "💻", lat: 25.0342, lng: 121.6153 },
      { name: "展區 B-設計", icon: "🎨", lat: 25.0338, lng: 121.6147 },
      { name: "VIP 休息室", icon: "⭐", lat: 25.0345, lng: 121.6155 },
      { name: "餐飲區", icon: "🍽️", lat: 25.0335, lng: 121.6145 }
    ],
    geofences: [
      { name: "展場範圍", lat: 25.0340, lng: 121.6150, radius: 500 },
      { name: "VIP 專區", lat: 25.0345, lng: 121.6155, radius: 30 }
    ],
    groups: [
      { name: "VIP 貴賓", color: "#dc2626" },
      { name: "展覽設備", color: "#6366f1" }
    ],
    rules: [
      { name: "展品離開展場", condA: "geofence_out", condB: "", logic: "or", threshold: 10 },
      { name: "VIP 進入專區", condA: "geofence_out", condB: "", logic: "or", threshold: 5 }
    ],
    events: [
      { type: "info", icon: "⭐", message: "VIP 貴賓 A 進入展區 A-科技 — 停留 12 分鐘" },
      { type: "info", icon: "👥", message: "展區 A 當前人流: 156 人 (熱門)" },
      { type: "info", icon: "📦", message: "展品箱 #E05 已送達主舞台" },
      { type: "info", icon: "🗺️", message: "VIP 動線: 入口→A區→B區→休息室 (平均 45 分鐘)" },
      { type: "info", icon: "📊", message: "今日入場: 2,340 人 · 平均停留: 2.1 小時" }
    ]
  },
  agriculture: {
    name: "農業",
    icon: "🌾",
    brand: { company: "智慧農場", primary: "#16a34a", accent: "#22c55e" },
    aliases: { TAG1: "曳引機 JD-01", TAG2: "採收箱 H-15" },
    pois: [
      { name: "農舍/辦公室", icon: "🏠", lat: 23.4730, lng: 120.4420 },
      { name: "A 區稻田", icon: "🌾", lat: 23.4740, lng: 120.4430 },
      { name: "B 區果園", icon: "🍎", lat: 23.4720, lng: 120.4410 },
      { name: "灌溉站", icon: "💧", lat: 23.4735, lng: 120.4425 },
      { name: "冷藏倉", icon: "❄️", lat: 23.4728, lng: 120.4418 }
    ],
    geofences: [
      { name: "農場範圍", lat: 23.4730, lng: 120.4420, radius: 500 },
      { name: "灌溉區", lat: 23.4735, lng: 120.4425, radius: 100 }
    ],
    groups: [
      { name: "農機具", color: "#16a34a" },
      { name: "採收箱", color: "#ca8a04" }
    ],
    rules: [
      { name: "農機離開農場", condA: "geofence_out", condB: "", logic: "or", threshold: 20 },
      { name: "採收箱溫度異常", condA: "temp_high", condB: "", logic: "or", threshold: 25 }
    ],
    events: [
      { type: "info", icon: "🚜", message: "曳引機 JD-01 開始 A 區翻土作業" },
      { type: "info", icon: "📦", message: "採收箱 H-15 已送至冷藏倉 — 溫度 4.2°C" },
      { type: "info", icon: "💧", message: "灌溉站已啟動 — A 區自動灌溉中" },
      { type: "info", icon: "🌡️", message: "B 區果園土壤濕度: 62% (正常)" },
      { type: "info", icon: "📊", message: "本週農機使用: 曳引機 32h / 搬運車 18h" }
    ]
  },
  port: {
    name: "港口/航運",
    icon: "🚢",
    brand: { company: "高雄港務管理", primary: "#1d4ed8", accent: "#2563eb" },
    aliases: { TAG1: "貨櫃 CMAU-4521", TAG2: "拖車 T-09" },
    pois: [
      { name: "碼頭 A", icon: "⚓", lat: 22.6130, lng: 120.2810 },
      { name: "碼頭 B", icon: "⚓", lat: 22.6125, lng: 120.2820 },
      { name: "貨櫃場", icon: "📦", lat: 22.6140, lng: 120.2830 },
      { name: "海關查驗區", icon: "🛃", lat: 22.6135, lng: 120.2815 },
      { name: "出口閘門", icon: "🚪", lat: 22.6150, lng: 120.2840 }
    ],
    geofences: [
      { name: "港區範圍", lat: 22.6135, lng: 120.2820, radius: 1000 },
      { name: "管制區-海關", lat: 22.6135, lng: 120.2815, radius: 80 }
    ],
    groups: [
      { name: "貨櫃", color: "#1d4ed8" },
      { name: "港區車輛", color: "#f97316" }
    ],
    rules: [
      { name: "貨櫃離開港區", condA: "geofence_out", condB: "", logic: "or", threshold: 20 },
      { name: "拖車超時等待", condA: "offline", condB: "", logic: "or", threshold: 120 }
    ],
    events: [
      { type: "info", icon: "🚢", message: "貨櫃 CMAU-4521 已從碼頭 A 裝船" },
      { type: "info", icon: "🚛", message: "拖車 T-09 已將貨櫃送至貨櫃場 B-12 位" },
      { type: "warning", icon: "⏱️", message: "拖車 T-03 在海關查驗區等待超過 2 小時" },
      { type: "info", icon: "🛃", message: "貨櫃 CMAU-4521 海關查驗通過" },
      { type: "info", icon: "📊", message: "今日裝卸: 進港 45 櫃 / 出港 38 櫃 · 平均等待 35 分鐘" }
    ]
  }
};

function loadScenario(key) {
  const scenario = SCENARIOS[key];
  if (!scenario) return;

  const macs = allTags.map(t => t.mac);
  if (macs.length === 0) {
    showToast("請先連線再載入情境", "warning");
    return;
  }

  // 設定別名
  const tagKeys = Object.keys(scenario.aliases);
  tagKeys.forEach((tKey, i) => {
    if (macs[i]) tagAliases[macs[i]] = scenario.aliases[tKey];
  });
  localStorage.setItem("utfind_aliases", JSON.stringify(tagAliases));

  // 設定 POI
  // Clear existing POIs first
  Object.values(poiMarkers).forEach(m => map.removeLayer(m));
  poiMarkers = {};
  pois = scenario.pois.map((p, i) => ({ id: `sc_${key}_${i}`, ...p }));
  localStorage.setItem("utfind_pois", JSON.stringify(pois));
  drawAllPOIs();

  // 設定圍欄
  // Clear existing
  Object.values(geofenceCircles).forEach(c => map.removeLayer(c));
  geofenceCircles = {};
  geofences = scenario.geofences;
  localStorage.setItem("utfind_geofences", JSON.stringify(geofences));
  renderGeofenceList();
  drawAllGeofences();

  // 設定群組
  tagGroups = scenario.groups.map((g, i) => ({
    id: `sc_${key}_g${i}`,
    name: g.name,
    color: g.color,
    macs: macs.length > 1 ? [macs[i % macs.length]] : [macs[0]]
  }));
  localStorage.setItem("utfind_groups", JSON.stringify(tagGroups));

  // 設定告警規則
  alertRules = scenario.rules.map((r, i) => ({
    id: `sc_${key}_r${i}`,
    ...r,
    enabled: true
  }));
  localStorage.setItem("utfind_alert_rules", JSON.stringify(alertRules));

  // 注入事件
  const now = Date.now();
  const newEvents = scenario.events.map((e, i) => ({
    ...e,
    time: new Date(now - i * 600000).toISOString()
  }));
  eventLog = newEvents.concat(eventLog).slice(0, 200);
  localStorage.setItem("utfind_events", JSON.stringify(eventLog));

  // 套用品牌主題
  if (scenario.brand) {
    brandTheme = scenario.brand;
    localStorage.setItem("utfind_brand_theme", JSON.stringify(brandTheme));
    applyBrandTheme();
  }

  // 更新 UI
  renderTagList();
  populateHistoryCheckboxes();

  // 高亮已選情境
  document.querySelectorAll(".scenario-card").forEach(c => c.classList.remove("scenario-active"));
  const cards = document.querySelectorAll(".scenario-card");
  const keys = ["hospital","construction","school","pet","rental","exhibition","agriculture","port"];
  const idx = keys.indexOf(key);
  if (idx >= 0 && cards[idx]) cards[idx].classList.add("scenario-active");

  // 跳到地圖上的 POI 位置
  if (scenario.pois.length > 0) {
    const bounds = L.latLngBounds(scenario.pois.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }

  const status = document.getElementById("scenario-status");
  if (status) {
    status.className = "status success";
    status.textContent = `已載入「${scenario.name}」情境 — ${scenario.pois.length} 個標註、${scenario.geofences.length} 個圍欄、${scenario.rules.length} 條規則`;
  }
  showToast(`${scenario.icon} 已載入「${scenario.name}」情境`, "success");
  addEvent("scenario", `載入產業情境: ${scenario.name}`);
}

function clearScenario() {
  // 清除情境資料
  tagAliases = {};
  localStorage.setItem("utfind_aliases", "{}");

  Object.values(poiMarkers).forEach(m => map.removeLayer(m));
  poiMarkers = {};
  pois = [];
  localStorage.setItem("utfind_pois", "[]");

  Object.values(geofenceCircles).forEach(c => map.removeLayer(c));
  geofenceCircles = {};
  geofences = [];
  localStorage.setItem("utfind_geofences", "[]");
  renderGeofenceList();

  tagGroups = [];
  localStorage.setItem("utfind_groups", "[]");

  alertRules = [];
  localStorage.setItem("utfind_alert_rules", "[]");

  resetBrandTheme();

  document.querySelectorAll(".scenario-card").forEach(c => c.classList.remove("scenario-active"));

  renderTagList();
  populateHistoryCheckboxes();

  const status = document.getElementById("scenario-status");
  if (status) {
    status.className = "status info";
    status.textContent = "已清除所有情境資料";
  }
  showToast("已清除情境資料", "info");
}

// ========== Enter 鍵快捷連線 ==========
document.getElementById("api-key").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });

// 手動 Tag 輸入 Enter 鍵
document.getElementById("manual-tag-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addManualTag(); });

// 預設加入 C2:85:85:68:38:CA
if (!manualTags.includes("C2:85:85:68:38:CA")) {
  manualTags.push("C2:85:85:68:38:CA");
  localStorage.setItem("utfind_manual_tags", JSON.stringify(manualTags));
}

// 初始渲染手動 Tag 列表
renderManualTagList();
