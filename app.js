// ╔══════════════════════════════════════════════════════════════════╗
// ║  UTFind IoT Tag Dashboard — app.js  v4.5.0                     ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  功能模組索引：                                                  ║
// ║                                                                 ║
// ║  [A] 核心基礎 ─────────────────────────────────────────         ║
// ║    A1. 全域設定與常數                                            ║
// ║    A2. 地圖初始化與圖層                                          ║
// ║    A3. Marker 圖示                                              ║
// ║    A4. API 呼叫（含冷卻管控）                                     ║
// ║    A5. 連線與資料取得                                            ║
// ║    A6. 自動刷新與篩選                                            ║
// ║                                                                 ║
// ║  [B] 儀表板與視覺化 ─────────────────────────────────           ║
// ║    B1. KPI 儀表板與骨架屏                                        ║
// ║    B2. Tag 清單渲染與命名                                        ║
// ║    B3. 地圖 Markers 更新                                        ║
// ║    B4. 熱力圖、群集                                              ║
// ║    B5. 面板切換、深色模式                                         ║
// ║                                                                 ║
// ║  [C] 歷史軌跡與分析 ─────────────────────────────────           ║
// ║    C1. 歷史軌跡查詢（多 Tag 比對）                                ║
// ║    C2. 軌跡回放與速度色彩                                        ║
// ║    C3. 停留點分析                                                ║
// ║    C4. 匯出（CSV/GeoJSON）                                      ║
// ║                                                                 ║
// ║  [D] 地理圍欄與地圖工具 ─────────────────────────────           ║
// ║    D1. 圓形 / 多邊形圍欄                                        ║
// ║    D2. 距離測量、地址反查                                        ║
// ║    D3. 室內平面圖、POI 標註                                      ║
// ║                                                                 ║
// ║  [E] 告警與通知 ─────────────────────────────────────           ║
// ║    E1. 即時通知（SOS / 低電量 / 溫度）                            ║
// ║    E2. 告警規則引擎                                              ║
// ║    E3. 多渠道通知（LINE / Telegram / Webhook）                   ║
// ║    E4. 排程通知                                                  ║
// ║                                                                 ║
// ║  [F] 裝置管理 ───────────────────────────────────────           ║
// ║    F1. 手動 Tag 管理                                            ║
// ║    F2. Tag 分組與群組                                            ║
// ║    F3. OTA 韌體更新、E-Ink 標籤                                  ║
// ║    F4. 裝置健康評分、電量預測                                     ║
// ║    F5. 資產生命週期                                              ║
// ║                                                                 ║
// ║  [G] 報表與合規 ─────────────────────────────────────           ║
// ║    G1. 使用報表、列印報告                                        ║
// ║    G2. 數據比對報告                                              ║
// ║    G3. SLA 監控                                                  ║
// ║    G4. 碳足跡計算                                                ║
// ║                                                                 ║
// ║  [H] 帳戶與整合 ─────────────────────────────────────           ║
// ║    H1. 多帳戶切換                                                ║
// ║    H2. 角色權限                                                  ║
// ║    H3. 第三方整合、API Webhook                                   ║
// ║    H4. 批次 CSV 匯入                                            ║
// ║    H5. 稽核日誌                                                  ║
// ║                                                                 ║
// ║  [I] 外觀與品牌 ─────────────────────────────────────           ║
// ║    I1. 品牌白標主題 / Logo 上傳                                   ║
// ║    I2. 產業情境 Demo（8 產業）                                    ║
// ║    I3. 多語系 (i18n)                                             ║
// ║                                                                 ║
// ║  [J] 產業模組 ───────────────────────────────────────           ║
// ║    J1. 冷鏈管理（GDP/GSP、溫度逸脫、批號、HACCP）                  ║
// ║    J2. 物流追蹤（週轉率、滯留、偏離、ETA、盤點）                    ║
// ║                                                                 ║
// ║  [K] 進階功能 ───────────────────────────────────────           ║
// ║    K1. AI 行為預測                                               ║
// ║    K2. 即時共享連結                                              ║
// ║    K3. 離線模式 / PWA                                            ║
// ║    K4. 自訂 KPI 排列（拖曳）                                     ║
// ║    K5. 語音播報、QR Code 配對                                    ║
// ╚══════════════════════════════════════════════════════════════════╝

// ================================================================
//  [A1] 全域設定與常數
// ================================================================
const API_BASE = "/api/v1/tags";
const PLAN_LIMITS = {
  Basic:        { rateLimit: 2, maxTags: 100 },
  Professional: { rateLimit: 1, maxTags: 500 },
  Enterprise:   { rateLimit: null, maxTags: null },
};
const AUTO_REFRESH_INTERVAL = 30; // 每 30 秒自動刷新（API 冷卻已解除）
const API_COOLDOWN = 2000; // 2 秒緩衝（避免瞬間大量請求）
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
let tagTypeFilter = localStorage.getItem("utfind_tag_type_filter") || "all"; // "all" | "real" | "b2b"
let positionHistory = {}; // mac -> [{ lat, lng, time }, ...] 最近位置紀錄，用於算時速
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

// ================================================================
//  [A2] 地圖初始化與圖層
// ================================================================
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

// ================================================================
//  [A3] Marker 圖示
// ================================================================
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

// ================================================================
//  [A4] API 呼叫（含冷卻管控）
// ================================================================
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

// ================================================================
//  [F0] B2B Client Tags 合併
// ================================================================
let _clientTagsCache = [];

async function mergeClientTags() {
  try {
    const res = await fetch("/api/clients/tags");
    const tags = await res.json();
    _clientTagsCache = Array.isArray(tags) ? tags : [];
    console.log(`[B2B] 載入 ${_clientTagsCache.length} 個 client_tags`);
  } catch (e) {
    _clientTagsCache = [];
    console.log("[B2B] client_tags 載入略過:", e.message);
  }
}

function mergeClientTagsFromCache() {
  if (!_clientTagsCache.length) return;
  const existingMacs = new Set(allTags.map(t => t.mac.toUpperCase()));
  let added = 0;
  _clientTagsCache.forEach(ct => {
    const mac = ct.mac.toUpperCase();
    if (!existingMacs.has(mac)) {
      allTags.push({ mac, b2bTag: true, label: ct.label || null, client_id: ct.client_id });
      existingMacs.add(mac);
      added++;
    }
  });
  if (added > 0) console.log(`[B2B] 合併了 ${added} 個 client_tags`);
}

// ================================================================
//  [F1] 手動 Tag 管理
// ================================================================
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

// ================================================================
//  [A5] 連線與資料取得
// ================================================================
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
    // 並行載入：UTTEC Tags + B2B Client Tags
    const [uttecTags] = await Promise.all([
      apiCall("all", {}).catch(() => []),
      mergeClientTags(),  // 預先載入到暫存，稍後合併
    ]);
    allTags = Array.isArray(uttecTags) ? uttecTags : [];

    // 合併 B2B client_tags（已預先載入）
    mergeClientTagsFromCache();

    // 合併手動 Tag
    mergeManualTags();

    if (allTags.length === 0) {
      status.className = "status error"; status.textContent = "此金鑰下沒有任何 Tag";
      showSkeleton(false);
      return;
    }

    status.className = "status success";
    const manualCount = manualTags.length;
    const b2bCount = allTags.filter(t => t.b2bTag).length;
    const realCount = allTags.length - b2bCount - manualCount;
    status.textContent = `已取得 ${allTags.length} 個 Tag（${realCount} 實體 + ${b2bCount} B2B），正在取得位置...`;

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
    populateSensorSelects();
    loadSensorBindings();
    populatePdaTagCheckboxes();
    renderPdaProfiles();
    renderPdaSearchSelect();
    updateSensorSourceBadge();
    setTagFilter(tagTypeFilter);

    // 先用 B2B 模擬資料快速顯示地圖，不等 UTTEC
    mergeB2BSimulatedData();
    injectSensorData(latestData);
    renderTagList();
    updateMarkers();
    updateDashboard();

    // 背景載入真實 UTTEC 資料，完成後更新
    fetchLatest().then(() => setTagFilter(tagTypeFilter));
    startAutoRefresh();
  } catch (err) {
    status.className = "status error";
    status.textContent = err.message;
    showSkeleton(false);
    renderPlanError(err.message);
  }
}

// ---------- 感測器資料（優先 Supabase，fallback 模擬） ----------
let sensorDataCache = {}; // mac -> { temperature, humidity, ... }
let useFakeSensors = true; // Supabase 未設定時用假資料

async function fetchSensorData() {
  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = {};
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/sensors/latest", { headers });
    if (!resp.ok) throw new Error("sensor API error");
    const data = await resp.json();
    if (data && data.length > 0) {
      useFakeSensors = false;
      data.forEach(s => { sensorDataCache[s.mac] = s; });
      return;
    }
  } catch { /* Supabase 未設定或未授權，使用假資料 */ }
  useFakeSensors = true;
}

function injectSensorData(data) {
  data.forEach((tag) => {
    const cached = sensorDataCache[tag.mac];
    if (!useFakeSensors && cached) {
      tag.temperature = cached.temperature != null ? parseFloat(cached.temperature) : null;
      tag.humidity = cached.humidity != null ? parseFloat(cached.humidity) : null;
      tag.sensorSource = cached.source || "api";
      tag.sensorTime = cached.created_at;
    } else {
      // Fallback: 模擬資料
      const base = TEMP_MIN + Math.random() * (TEMP_MAX - TEMP_MIN);
      const drift = (Math.random() < 0.15) ? (Math.random() < 0.5 ? -2 : 2) : 0;
      tag.temperature = parseFloat((base + drift).toFixed(1));
      tag.humidity = parseFloat((40 + Math.random() * 40).toFixed(1));
      tag.sensorSource = "demo";
    }
  });
}

// ---------- B2B 模擬位置資料 ----------
function macToSeed(mac) {
  let h = 0;
  for (let i = 0; i < mac.length; i++) { h = ((h << 5) - h + mac.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// 台灣高速公路 / 主要路線座標點（已校正在陸地上）
const TW_ROUTES = [
  // 國道一號 (基隆→高雄，沿西部平原)
  { points: [[25.13,121.74],[25.05,121.53],[24.96,121.41],[24.82,120.97],[24.75,120.96],[24.59,120.83],[24.44,120.69],[24.15,120.68],[23.88,120.58],[23.58,120.45],[23.30,120.38],[22.99,120.30],[22.63,120.34]], name: "國道一號" },
  // 國道三號 (汐止→屏東，山線)
  { points: [[25.07,121.56],[24.94,121.48],[24.82,121.04],[24.67,120.93],[24.50,120.80],[24.26,120.73],[24.02,120.65],[23.72,120.52],[23.45,120.44],[23.12,120.40],[22.82,120.37],[22.58,120.40]], name: "國道三號" },
  // 國道五號 (南港→宜蘭)
  { points: [[25.04,121.58],[24.98,121.56],[24.91,121.58],[24.83,121.72],[24.76,121.75]], name: "國道五號" },
  // 台61西濱快 (八里→鹿港→北港)
  { points: [[25.10,121.40],[24.95,120.97],[24.83,120.90],[24.53,120.65],[24.26,120.55],[24.05,120.50],[23.65,120.34],[23.30,120.28]], name: "西濱快" },
  // 台9東部公路 (宜蘭→花蓮→台東，靠山側)
  { points: [[24.75,121.75],[24.55,121.78],[24.30,121.72],[24.00,121.60],[23.75,121.50],[23.50,121.38],[23.25,121.20],[23.00,121.15]], name: "東部公路" },
];

// 固定地點 (倉庫/門市/工廠，都是市中心座標)
const TW_FIXED_LOCATIONS = [
  { lat: 25.0330, lng: 121.5654, area: "台北" },
  { lat: 24.9984, lng: 121.4586, area: "板橋" },
  { lat: 24.9936, lng: 121.3010, area: "桃園" },
  { lat: 24.8015, lng: 120.9718, area: "新竹" },
  { lat: 24.1477, lng: 120.6736, area: "台中" },
  { lat: 24.0752, lng: 120.5413, area: "彰化" },
  { lat: 23.4801, lng: 120.4491, area: "嘉義" },
  { lat: 22.9998, lng: 120.2268, area: "台南" },
  { lat: 22.6273, lng: 120.3014, area: "高雄" },
  { lat: 22.7583, lng: 121.1444, area: "台東" },
  { lat: 23.9910, lng: 121.6014, area: "花蓮" },
  { lat: 24.7570, lng: 121.7533, area: "宜蘭" },
  { lat: 25.1276, lng: 121.7392, area: "基隆" },
  { lat: 24.5602, lng: 120.8214, area: "苗栗" },
  { lat: 23.7092, lng: 120.5313, area: "雲林" },
  { lat: 22.6693, lng: 120.4865, area: "屏東" },
  { lat: 24.2706, lng: 120.7133, area: "豐原" },
  { lat: 23.8124, lng: 120.6866, area: "南投" },
  { lat: 25.0118, lng: 121.2130, area: "林口" },
  { lat: 24.9384, lng: 121.2269, area: "中壢" },
];

// 移動中的 Tag 狀態（持久化在 session 中）
let movingTagStates = {};

function mergeB2BSimulatedData() {
  const existingMacs = new Set(latestData.map(d => (d.mac || "").toUpperCase()));
  const b2bTags = allTags.filter(t => t.b2bTag && !existingMacs.has(t.mac.toUpperCase()));

  b2bTags.forEach(tag => {
    const seed = macToSeed(tag.mac);
    const s1 = ((seed * 9301 + 49297) % 233280) / 233280;
    const type = s1 < 0.35 ? "moving" : "fixed"; // 35% 為移動車輛
    const battery = Math.floor(30 + ((seed * 6571 + 31337) % 233280) / 233280 * 70);

    let lat, lng, speed = 0, heading = "";

    if (type === "fixed") {
      // 固定點：倉庫/門市/工廠，加一點隨機偏移
      const locIdx = seed % TW_FIXED_LOCATIONS.length;
      const loc = TW_FIXED_LOCATIONS[locIdx];
      const jitterLat = ((seed * 3571) % 10000) / 10000 * 0.004 - 0.002;
      const jitterLng = ((seed * 7127) % 10000) / 10000 * 0.004 - 0.002;
      lat = loc.lat + jitterLat;
      lng = loc.lng + jitterLng;
    } else {
      // 移動車輛：沿高速公路路線移動
      const routeIdx = seed % TW_ROUTES.length;
      const route = TW_ROUTES[routeIdx];
      const pts = route.points;

      // 初始化或取得目前狀態
      if (!movingTagStates[tag.mac]) {
        const startSeg = seed % (pts.length - 1);
        const dir = ((seed * 4217) % 2 === 0) ? 1 : -1;
        movingTagStates[tag.mac] = {
          routeIdx,
          segment: startSeg,
          progress: ((seed * 8123) % 1000) / 1000,
          direction: dir,
          speed: 60 + Math.floor(((seed * 2341) % 100) / 100 * 60), // 60~120 km/h
        };
      }

      const state = movingTagStates[tag.mac];
      const seg = state.segment;
      const p = state.progress;
      const p1 = pts[seg];
      const p2 = pts[Math.min(seg + 1, pts.length - 1)];

      // 插值計算目前位置
      lat = p1[0] + (p2[0] - p1[0]) * p;
      lng = p1[1] + (p2[1] - p1[1]) * p;

      // 加一點隨機偏移模擬車道（極小偏移，不會跑到海上）
      lat += (Math.random() - 0.5) * 0.0005;
      lng += (Math.random() - 0.5) * 0.0005;

      speed = state.speed + Math.floor((Math.random() - 0.5) * 20);
      heading = state.direction > 0 ? "南行" : "北行";

      // 推進位置（每次 refresh 移動一段）
      const step = 0.03 + Math.random() * 0.04; // 每次移動 3~7%
      state.progress += step * state.direction;

      // 到端點就折返或跳到下一段
      if (state.progress >= 1) {
        state.progress = 0;
        state.segment++;
        if (state.segment >= pts.length - 1) {
          state.direction = -1;
          state.segment = pts.length - 2;
          state.progress = 1;
        }
      } else if (state.progress <= 0) {
        state.progress = 1;
        state.segment--;
        if (state.segment < 0) {
          state.direction = 1;
          state.segment = 0;
          state.progress = 0;
        }
      }
    }

    const parsedLat = parseFloat(lat.toFixed(6));
    const parsedLng = parseFloat(lng.toFixed(6));
    latestData.push({
      mac: tag.mac,
      latitude: parsedLat,
      longitude: parsedLng,
      lastLatitude: parsedLat,
      lastLongitude: parsedLng,
      lastBatteryLevel: battery,
      lastRequestDate: new Date(Date.now() - Math.floor(Math.random() * 5) * 60000).toISOString(),
      status: battery < 20 ? "lowBattery" : "normal",
      b2bSimulated: true,
      b2bType: type,
      label: tag.label || null,
      speed: type === "moving" ? Math.max(0, speed) : 0,
      heading: heading,
    });
  });
}

// ---------- 速度計算（根據位置歷史） ----------
function calculateTagSpeeds() {
  const now = Date.now();
  latestData.forEach(tag => {
    if (tag.lastLatitude == null || tag.lastLongitude == null) return;

    const mac = tag.mac;
    if (!positionHistory[mac]) positionHistory[mac] = [];

    const history = positionHistory[mac];
    const newPoint = {
      lat: tag.lastLatitude,
      lng: tag.lastLongitude,
      time: tag.lastRequestDate ? new Date(tag.lastRequestDate).getTime() : now,
    };

    // 跟上一個點比較算速度
    if (history.length > 0) {
      const prev = history[history.length - 1];
      const dist = haversine(prev.lat, prev.lng, newPoint.lat, newPoint.lng); // km
      const timeDiffH = (newPoint.time - prev.time) / 3600000; // hours

      if (timeDiffH > 0.0001 && dist > 0.001) { // 至少有移動 1 公尺
        tag._speed = Math.round(dist / timeDiffH); // km/h
      } else {
        tag._speed = 0;
      }

      // 用最近 3 筆算平均速度（更平滑）
      if (history.length >= 2) {
        const older = history[history.length - 2];
        const totalDist = haversine(older.lat, older.lng, newPoint.lat, newPoint.lng);
        const totalTimeH = (newPoint.time - older.time) / 3600000;
        if (totalTimeH > 0.0001 && totalDist > 0.001) {
          tag._avgSpeed = Math.round(totalDist / totalTimeH);
        }
      }
    } else {
      // B2B 模擬車輛直接用預設速度
      tag._speed = tag.speed || 0;
    }

    // 記錄新位置（保留最近 5 筆）
    history.push(newPoint);
    if (history.length > 5) history.shift();
  });
}

// ---------- 取得最新定位 ----------
async function fetchLatest() {
  // 只送真實 TAG 到 UTTEC，B2B 模擬的不送（大幅加速）
  const realMacs = allTags.filter(t => !t.b2bTag).map(t => t.mac);
  try {
    // 並行：UTTEC 查詢 + 感測器資料
    const [result] = await Promise.all([
      apiCall("latest", { macs: realMacs }),
      fetchSensorData(),
    ]);
    latestData = Array.isArray(result) ? result : [];

    // 為 B2B tags 補上模擬位置（UTTEC 不會回傳它們）
    mergeB2BSimulatedData();

    // 計算每個 tag 的即時速度
    calculateTagSpeeds();

    injectSensorData(latestData);
    updateSensorSourceBadge();
    renderTagList();
    updateMarkers();
    updateDashboard();
    checkAlerts();
    checkGeofenceAlerts();
    cacheLatestData();
    evaluateAlertRules();
    updateTaskMileage();
    checkTaskArrivals();
    // deviceAutoCheckin removed — PDA location now uses Tag binding
    const status = document.getElementById("key-status");
    if (status) {
      status.className = "status success";
      status.textContent = `已連線，共 ${allTags.length} 個 Tag · 上次更新 ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    console.error("fetchLatest error:", err);
  }
}

// ================================================================
//  [B1] KPI 儀表板與骨架屏
// ================================================================
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

// ---------- KPI 動畫 ----------
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

// ---------- 骨架屏 ----------
function showSkeleton(show) {
  const skel = document.getElementById("kpi-skeleton");
  if (skel) skel.style.display = show ? "grid" : "none";
}

// ================================================================
//  [E1] 即時通知（SOS / 低電量 / 溫度）
// ================================================================
function checkAlerts() {
  latestData.forEach((tag) => {
    const alias = tagAliases[tag.mac] || tag.mac;
    if (tag.status === "sos" && !lastNotifiedSos.has(tag.mac)) {
      lastNotifiedSos.add(tag.mac);
      pushAlert("🚨", `${alias} 發出 SOS 求救！`, "danger");
      playAlertSound(800, 3);
      triggerWebhook("sos", { mac: tag.mac, alias, status: "sos", lat: tag.lastLatitude, lng: tag.lastLongitude });
    }
    if (tag.lastBatteryLevel != null && tag.lastBatteryLevel <= 20 && !lastNotifiedLowBat.has(tag.mac)) {
      lastNotifiedLowBat.add(tag.mac);
      pushAlert("🔋", `${alias} 電量不足 (${tag.lastBatteryLevel}%)`, "warning");
      triggerWebhook("lowbat", { mac: tag.mac, alias, battery: tag.lastBatteryLevel });
    }
    // 溫度警示
    if (tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX) && !lastNotifiedTemp.has(tag.mac)) {
      lastNotifiedTemp.add(tag.mac);
      const dir = tag.temperature < TEMP_MIN ? "過低" : "過高";
      pushAlert("🌡️", `${alias} 溫度${dir}！(${tag.temperature}°C，範圍 ${TEMP_MIN}~${TEMP_MAX}°C)`, "danger");
      playAlertSound(600, 2);
      triggerWebhook("temp", { mac: tag.mac, alias, temperature: tag.temperature, min: TEMP_MIN, max: TEMP_MAX });
    }
    if (tag.status !== "sos") lastNotifiedSos.delete(tag.mac);
    if (tag.lastBatteryLevel > 20) lastNotifiedLowBat.delete(tag.mac);
    if (tag.temperature != null && tag.temperature >= TEMP_MIN && tag.temperature <= TEMP_MAX) lastNotifiedTemp.delete(tag.mac);
  });
}

// ---------- 浮動告警面板 ----------
let alertPanelItems = JSON.parse(localStorage.getItem("utfind_alerts") || "[]");
let alertFilter = "active"; // "active", "acknowledged", "all"

// 重建 Date 物件
alertPanelItems.forEach(a => {
  a.time = new Date(a.time);
  if (a.acknowledgedAt) a.acknowledgedAt = new Date(a.acknowledgedAt);
});

function pushAlert(icon, message, type = "danger") {
  const item = {
    id: Date.now() + Math.random(),
    icon,
    message,
    type,
    time: new Date(),
    status: "active",
    acknowledgedBy: null,
    acknowledgedAt: null,
    notes: null
  };
  alertPanelItems.unshift(item);
  if (alertPanelItems.length > 100) alertPanelItems.length = 100;
  saveAlertItems();
  renderAlertPanel();
}

function saveAlertItems() {
  localStorage.setItem("utfind_alerts", JSON.stringify(alertPanelItems));
}

function getFilteredAlerts() {
  switch (alertFilter) {
    case "active": return alertPanelItems.filter(a => a.status === "active");
    case "acknowledged": return alertPanelItems.filter(a => a.status === "acknowledged");
    default: return alertPanelItems;
  }
}

function setAlertFilter(filter) {
  alertFilter = filter;
  document.querySelectorAll(".alert-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  renderAlertPanel();
}

function acknowledgeAlert(id) {
  const alert = alertPanelItems.find(a => a.id === id);
  if (!alert) return;

  const notes = prompt("確認備註 (可選):", "");
  const acknowledger = prompt("確認人:", currentRole || "操作員");

  if (acknowledger === null) return;

  alert.status = "acknowledged";
  alert.acknowledgedBy = acknowledger || "未知";
  alert.acknowledgedAt = new Date();
  alert.notes = notes || null;

  saveAlertItems();
  renderAlertPanel();
  addAudit(`確認告警: ${alert.message.substring(0, 30)}... by ${alert.acknowledgedBy}`);
  showToast("告警已確認", "success", 2000);
}

function renderAlertPanel() {
  const panel = document.getElementById("alert-panel");
  const list = document.getElementById("alert-panel-list");
  const count = document.getElementById("alert-panel-count");
  if (!panel || !list) return;

  const activeCount = alertPanelItems.filter(a => a.status === "active").length;

  if (alertPanelItems.length === 0) { panel.style.display = "none"; return; }
  panel.style.display = "flex";
  count.textContent = activeCount;

  const filtered = getFilteredAlerts();
  const ackCount = alertPanelItems.filter(a => a.status === "acknowledged").length;

  list.innerHTML = `
    <div class="alert-filter-bar">
      <button class="alert-filter-btn ${alertFilter === 'active' ? 'active' : ''}" data-filter="active" onclick="setAlertFilter('active')">待處理 (${activeCount})</button>
      <button class="alert-filter-btn ${alertFilter === 'acknowledged' ? 'active' : ''}" data-filter="acknowledged" onclick="setAlertFilter('acknowledged')">已確認 (${ackCount})</button>
      <button class="alert-filter-btn ${alertFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="setAlertFilter('all')">全部</button>
    </div>
  ` + filtered.map(a => {
    const t = a.time.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const cls = a.type === "warning" ? " warning" : "";
    const ackCls = a.status === "acknowledged" ? " acknowledged" : "";
    const ackInfo = a.status === "acknowledged"
      ? `<div class="alert-ack-info">✓ ${a.acknowledgedBy} · ${a.acknowledgedAt.toLocaleTimeString("zh-TW")}${a.notes ? ` · ${a.notes}` : ""}</div>`
      : "";
    const ackBtn = a.status === "active"
      ? `<button class="alert-ack-btn" onclick="acknowledgeAlert(${a.id})" title="確認">✓</button>`
      : "";

    return `<div class="alert-panel-item${cls}${ackCls}">
      <span class="alert-icon">${a.icon}</span>
      <div class="alert-body">
        <div class="alert-msg">${a.message}</div>
        <div class="alert-time">${t}</div>
        ${ackInfo}
      </div>
      ${ackBtn}
      <button class="alert-dismiss" onclick="dismissAlertItem(${a.id})" title="刪除">&times;</button>
    </div>`;
  }).join("");
}

function dismissAlertItem(id) {
  alertPanelItems = alertPanelItems.filter(a => a.id !== id);
  saveAlertItems();
  renderAlertPanel();
}

function dismissAlertPanel() {
  alertPanelItems = [];
  saveAlertItems();
  const panel = document.getElementById("alert-panel");
  if (panel) panel.style.display = "none";
}

function triggerTestAlerts() {
  pushAlert("🚨", "Tag-A3 (輪椅 #7) 發出 SOS 求救！", "danger");
  playAlertSound(800, 3);
  setTimeout(() => {
    pushAlert("🌡️", "Tag-B1 (冷藏櫃 #2) 溫度過高！(12.3°C，範圍 2~8°C)", "danger");
    playAlertSound(600, 2);
  }, 1500);
  setTimeout(() => {
    pushAlert("📍", "Tag-C5 (配送車 #3) 離開圍欄「台北倉庫」", "warning");
  }, 3000);
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

// ================================================================
//  [A6] 自動刷新與篩選
// ================================================================
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

// ---------- 篩選 ----------
function filterTags(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll("#filter-bar .btn-chip").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderTagList();
}

function getFilteredData() {
  // 先依 tag 類型篩選
  let data = latestData;
  if (tagTypeFilter === "real") data = data.filter(t => !t.b2bSimulated);
  else if (tagTypeFilter === "b2b") data = data.filter(t => t.b2bSimulated);

  // 再依狀態篩選
  if (currentFilter === "all") return data;
  if (currentFilter === "sos") return data.filter((t) => t.status === "sos");
  if (currentFilter === "lowbat") return data.filter((t) => t.lastBatteryLevel != null && t.lastBatteryLevel <= 20);
  if (currentFilter === "normal") return data.filter((t) => t.status !== "sos");
  if (currentFilter === "tempalert") return data.filter((t) => t.temperature != null && (t.temperature < TEMP_MIN || t.temperature > TEMP_MAX));
  return data;
}

function setTagFilter(type) {
  tagTypeFilter = type;
  localStorage.setItem("utfind_tag_type_filter", type);

  // 更新按鈕狀態
  document.querySelectorAll("#tag-filter-btns button").forEach(btn => {
    btn.className = btn.id === `filter-${type}` ? "btn-accent" : "btn-ghost";
  });

  // 更新資訊
  const realCount = latestData.filter(t => !t.b2bSimulated).length;
  const b2bCount = latestData.filter(t => t.b2bSimulated).length;
  const info = document.getElementById("tag-filter-info");
  if (info) {
    const showing = type === "all" ? latestData.length : type === "real" ? realCount : b2bCount;
    info.textContent = `顯示 ${showing} / ${latestData.length} 個 Tag（實體 ${realCount}，模擬 ${b2bCount}）`;
  }

  // 重新渲染
  renderTagList();
  updateMarkers();
  updateDashboard();
}

// ================================================================
//  [B2] Tag 清單渲染與命名
// ================================================================
const TAG_LIST_PAGE_SIZE = 30;
let _tagListRendered = 0;
let _tagListFiltered = [];

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

  // 分頁載入：先渲染前 30 個，滾動時載入更多
  _tagListFiltered = filtered;
  _tagListRendered = Math.min(TAG_LIST_PAGE_SIZE, filtered.length);
  const batch = filtered.slice(0, _tagListRendered);

  let html = batch.map(renderTagCard).join("");
  if (filtered.length > _tagListRendered) {
    html += `<div id="tag-load-more" class="empty-state" style="cursor:pointer;padding:12px;" onclick="loadMoreTags()">
      顯示更多（已載入 ${_tagListRendered}/${filtered.length}）
    </div>`;
  }
  container.innerHTML = html;
  return;
}

function loadMoreTags() {
  const container = document.getElementById("tag-list");
  const loadMoreEl = document.getElementById("tag-load-more");
  if (loadMoreEl) loadMoreEl.remove();

  const nextBatch = _tagListFiltered.slice(_tagListRendered, _tagListRendered + TAG_LIST_PAGE_SIZE);
  _tagListRendered += nextBatch.length;

  const fragment = document.createElement("div");
  fragment.innerHTML = nextBatch.map(renderTagCard).join("");
  while (fragment.firstChild) container.appendChild(fragment.firstChild);

  if (_tagListFiltered.length > _tagListRendered) {
    const more = document.createElement("div");
    more.id = "tag-load-more";
    more.className = "empty-state";
    more.style.cssText = "cursor:pointer;padding:12px;";
    more.onclick = loadMoreTags;
    more.textContent = `顯示更多（已載入 ${_tagListRendered}/${_tagListFiltered.length}）`;
    container.appendChild(more);
  }
}

function renderTagCard(tag) {
  const bat = tag.lastBatteryLevel;
  const batClass = bat == null ? "mid" : bat > 50 ? "high" : bat > 20 ? "mid" : "low";
  const batText = bat == null ? "--" : `${bat}%`;
  const timeAgo = relativeTime(tag.lastRequestDate);
  const statusClass = tag.status || "normal";
  const alias = tagAliases[tag.mac] || tag.label || "設定名稱";
  const tempAlert = tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX);
  let cardClass = "tag-card";
  if (statusClass === "sos") cardClass += " sos-card";
  if (tempAlert) cardClass += " temp-alert-card";

  const tempClass = tempAlert ? "sensor-alert" : "sensor-ok";
  const tempText = tag.temperature != null ? `${tag.temperature}°C` : "--";
  const humText = tag.humidity != null ? `${tag.humidity}%` : "--";
  const typeTag = tag.b2bSimulated ? (tag.b2bType === "moving" ? '<span style="color:var(--warning);font-size:10px;">🚛</span>' : '<span style="color:var(--text-muted);font-size:10px;">📍</span>') : '';
  const speed = tag._speed || tag.speed || 0;
  const speedColor = speed > 100 ? 'var(--danger)' : speed > 60 ? 'var(--warning)' : speed > 0 ? 'var(--success)' : 'var(--text-muted)';
  const speedText = speed > 0 ? `${speed} km/h` : "靜止";

  return `
  <div class="${cardClass}" onclick="focusTag('${tag.mac}')">
    <div class="tag-name-row">
      <span class="mac">${typeTag} ${tag.mac}</span>
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
      <span style="color:${speedColor};font-size:11px;">🚗 ${speedText}</span>
    </div>
    <div class="tag-meta" style="margin-top:3px;">
      <span class="tag-time-ago">${timeAgo}</span>
      <span>${tag.lastLatitude?.toFixed(5)}, ${tag.lastLongitude?.toFixed(5)}</span>
    </div>
  </div>`;
}

// ---------- Tag 命名 ----------
function renameTag(mac) {
  const name = prompt(`為 ${mac} 設定名稱：`, tagAliases[mac] || "");
  if (name === null) return;
  if (name.trim()) tagAliases[mac] = name.trim();
  else delete tagAliases[mac];
  localStorage.setItem("utfind_aliases", JSON.stringify(tagAliases));
  renderTagList();
  populateHistoryCheckboxes();
}

// ================================================================
//  [B3] 地圖 Markers 更新
// ================================================================
let _markerCluster = null;

function updateMarkers() {
  // 套用 tag 類型篩選
  const filtered = tagTypeFilter === "real" ? latestData.filter(t => !t.b2bSimulated)
    : tagTypeFilter === "b2b" ? latestData.filter(t => t.b2bSimulated)
    : latestData;

  const newMacs = new Set();
  const bounds = [];

  filtered.forEach((tag) => {
    if (tag.lastLatitude == null || tag.lastLongitude == null) return;
    newMacs.add(tag.mac);
    const pos = [tag.lastLatitude, tag.lastLongitude];

    if (markers[tag.mac]) {
      // 已有 marker → 更新位置（不重建）
      markers[tag.mac].setLatLng(pos);
      markers[tag.mac].setIcon(createIcon(tag.status));
      markers[tag.mac]._popup && markers[tag.mac].setPopupContent(createPopupContent(tag));
    } else {
      // 新 marker
      const marker = L.marker(pos, { icon: createIcon(tag.status) })
        .bindPopup(createPopupContent(tag));
      markers[tag.mac] = marker;
    }
    bounds.push(pos);
  });

  // 移除不再顯示的 marker
  Object.keys(markers).forEach(mac => {
    if (!newMacs.has(mac)) {
      map.removeLayer(markers[mac]);
      delete markers[mac];
    }
  });

  // 用 MarkerCluster 批次加入（300+ 點效能大幅提升）
  if (_markerCluster) map.removeLayer(_markerCluster);

  if (clusterOn || Object.keys(markers).length > 50) {
    _markerCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 10,
    });
    Object.values(markers).forEach(m => {
      if (map.hasLayer(m)) map.removeLayer(m);
      _markerCluster.addLayer(m);
    });
    map.addLayer(_markerCluster);
  } else {
    _markerCluster = null;
    Object.values(markers).forEach(m => {
      if (!map.hasLayer(m)) m.addTo(map);
    });
  }

  // 只在首次載入時 fitBounds
  if (bounds.length > 0 && !window._initialBoundsFit) {
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    window._initialBoundsFit = true;
  }
}

function createPopupContent(tag) {
  const bat = tag.lastBatteryLevel != null ? `${tag.lastBatteryLevel}%` : "--";
  const alias = tagAliases[tag.mac] ? `<p style="font-weight:600;margin-bottom:2px;">${tagAliases[tag.mac]}</p>` : "";
  const labelName = tag.label ? `<p style="color:var(--text-muted);font-size:11px;">${tag.label}</p>` : "";
  const status = tag.status === "sos" ? '<span style="color:#ef4444;font-weight:700;">SOS</span>' : '<span style="color:#22c55e;">正常</span>';
  const temp = tag.temperature != null ? `${tag.temperature}°C` : "--";
  const hum = tag.humidity != null ? `${tag.humidity}%` : "--";
  const tempAlert = tag.temperature != null && (tag.temperature < TEMP_MIN || tag.temperature > TEMP_MAX);
  const tempStyle = tempAlert ? 'color:#ef4444;font-weight:700;' : '';

  // 速度顯示
  const speed = tag._speed || tag.speed || 0;
  const avgSpeed = tag._avgSpeed;
  const speedColor = speed > 100 ? '#ef4444' : speed > 60 ? '#f59e0b' : speed > 0 ? '#22c55e' : 'var(--text-muted)';
  const speedText = speed > 0 ? `${speed} km/h` : "靜止";
  const avgText = avgSpeed != null && avgSpeed > 0 ? ` (均速 ${avgSpeed} km/h)` : "";
  const headingText = tag.heading ? ` · ${tag.heading}` : "";

  return `<div class="popup-content">
    ${alias}${labelName}<h3>${tag.mac}</h3>
    <p>狀態：${status}</p><p>電量：${bat}</p>
    <p style="color:${speedColor};font-weight:600;">速度：${speedText}${avgText}${headingText}</p>
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

// ================================================================
//  [B5] 面板切換、深色模式
// ================================================================
function switchPanel(name) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const panel = document.getElementById(`panel-${name}`);
  const nav = document.getElementById(`nav-${name}`);
  if (panel) panel.classList.add("active");
  if (nav) nav.classList.add("active");

  // Initialize admin panel if switching to it
  if (name === "admin" && typeof initAdminPanel === "function") {
    initAdminPanel();
  }
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle("section-collapsed");
}

// ---------- 深色模式 ----------
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

// ================================================================
//  [C1] 歷史軌跡查詢（多 Tag 比對）
// ================================================================
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

// ================================================================
//  [C2] 軌跡回放
// ================================================================
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

// ================================================================
//  [C4] 匯出（CSV / GeoJSON）
// ================================================================
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

// ================================================================
//  [D2] 距離測量、地址反查
// ================================================================
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

// ---------- 地址反查 ----------
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

// ================================================================
//  [D1] 圓形 / 多邊形圍欄
// ================================================================
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
        pushAlert("📍", `${alias} 離開圍欄「${gf.name}」`, "warning");
        triggerWebhook("geofence", { mac: tag.mac, alias, geofenceName: gf.name, geofenceId: gf.id, lat: tag.lastLatitude, lng: tag.lastLongitude });
      }
      if (inside) geofenceAlertSent.delete(key);
    });
  });
}
const geofenceAlertSent = new Set();

// ---------- 工具函式 ----------
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

// ---------- 方案資訊 ----------
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

// ---------- Tag 詳情面板 ----------
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

// ================================================================
//  [B4] 熱力圖、群集
// ================================================================
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

// ---------- Marker 群集 ----------
function toggleClustering() {
  clusterOn = !clusterOn;
  document.getElementById("btn-cluster").classList.toggle("active", clusterOn);
  // 現在預設使用 MarkerCluster，切換時重新渲染
  updateMarkers();
}

// ---------- 速度計算 (歷史軌跡) ----------
function calcSpeed(p1, p2) {
  if (!p1.lastRequestDate || !p2.lastRequestDate) return null;
  const dist = haversine(p1.lastLatitude, p1.lastLongitude, p2.lastLatitude, p2.lastLongitude);
  const timeDiff = (new Date(p2.lastRequestDate) - new Date(p1.lastRequestDate)) / 3600000;
  if (timeDiff <= 0) return null;
  return dist / timeDiff; // km/h
}

// ---------- 事件日誌 ----------
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

// ---------- 分享連結 ----------
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

// ================================================================
//  [G1] 使用報表、列印報告
// ================================================================
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

// ---------- 通知音效開關 ----------
function toggleNotifSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById("btn-sound");
  btn.classList.toggle("sound-off", !soundEnabled);
  showToast(soundEnabled ? "通知音效已開啟" : "通知音效已關閉", "info", 2000);
}

// ================================================================
//  [I3] 多語系 (i18n)
// ================================================================
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

// ================================================================
//  [K3] 離線模式 / PWA
// ================================================================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.log("SW registration failed:", e));
}

// ---------- 鍵盤快捷鍵 ----------
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

// ---------- 通知增強（加入事件日誌） ----------
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

// ---------- 更新 Markers 支援群集 ----------
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

// ---------- 歷史統計增加速度 ----------
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

// ---------- 初始化 ----------
applyLang();
renderEventLog();

// ================================================================
//  [C2+] 路徑回放箭頭 + 速度色彩
// ================================================================
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

// ================================================================
//  [D1+] 多邊形圍欄
// ================================================================
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

// ================================================================
//  [C3] 停留點分析
// ================================================================
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

// ================================================================
//  [D3] 室內平面圖、POI 標註
// ================================================================
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

// ---------- 使用報表 ----------
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

// ---------- 異常行為偵測 ----------
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

// ================================================================
//  [F4] 裝置健康評分、電量預測
// ================================================================
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

// ---------- 裝置健康評分 ----------
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

// ================================================================
//  [H2] 角色權限
// ================================================================
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

// ================================================================
//  [F2] Tag 分組與群組
// ================================================================
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

// ---------- 任務指派 ----------
let tasks = JSON.parse(localStorage.getItem("utfind_tasks") || "[]");

function populateTaskTagSelect() {
  const sel = document.getElementById("task-tag-select");
  if (!sel || allTags.length === 0) return;
  sel.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
    return `<option value="${t.mac}">${t.mac}${alias}</option>`;
  }).join("");
}

function populateTaskDestinationSelect() {
  const sel = document.getElementById("task-destination");
  if (!sel) return;
  sel.innerHTML = '<option value="">不設定</option>' +
    geofences.map(gf => `<option value="${gf.id}">${gf.name}</option>`).join("");
}

function saveTask() {
  const name = document.getElementById("task-name").value.trim();
  const mac = document.getElementById("task-tag-select").value;
  const deadline = document.getElementById("task-deadline").value;
  const shipmentNo = document.getElementById("task-shipment-no")?.value.trim() || null;
  const destinationGf = document.getElementById("task-destination")?.value || null;

  if (!name) { showToast("請輸入任務名稱", "warning"); return; }

  const tag = latestData.find(t => t.mac === mac);

  const task = {
    id: Date.now().toString(),
    name,
    mac,
    deadline: deadline || null,
    shipmentNo,
    destinationGeofenceId: destinationGf,
    status: "active",
    createdAt: new Date().toISOString(),
    startPosition: tag && tag.lastLatitude != null ? { lat: tag.lastLatitude, lng: tag.lastLongitude, time: new Date().toISOString() } : null,
    totalMileageKm: 0,
    lastMileageUpdate: null,
    mileageHistory: [],
    arrivedAt: null,
    completedAt: null,
    arrivalNotified: false
  };

  tasks.push(task);
  localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
  document.getElementById("task-name").value = "";
  if (document.getElementById("task-shipment-no")) document.getElementById("task-shipment-no").value = "";
  renderTaskList();
  addAudit(`建立任務: ${name}${shipmentNo ? ` (${shipmentNo})` : ""}`);
  showToast(`已建立任務「${name}」`, "success");
}

function updateTaskMileage() {
  let updated = false;
  tasks.forEach(task => {
    if (task.status !== "active" || !task.mac) return;

    const tag = latestData.find(t => t.mac === task.mac);
    if (!tag || tag.lastLatitude == null) return;

    const currentPos = { lat: tag.lastLatitude, lng: tag.lastLongitude };

    // 初始化歷史
    if (task.mileageHistory.length === 0 && task.startPosition) {
      task.mileageHistory.push({ ...task.startPosition });
    }

    // 計算與上一點的距離
    if (task.mileageHistory.length > 0) {
      const lastPoint = task.mileageHistory[task.mileageHistory.length - 1];
      const distKm = haversine(lastPoint.lat, lastPoint.lng, currentPos.lat, currentPos.lng);

      // 移動超過 10 公尺才記錄
      if (distKm > 0.01) {
        task.totalMileageKm += distKm;
        task.mileageHistory.push({ lat: currentPos.lat, lng: currentPos.lng, time: new Date().toISOString() });
        task.lastMileageUpdate = new Date().toISOString();
        updated = true;

        // 保持歷史記錄在可控範圍
        if (task.mileageHistory.length > 500) {
          task.mileageHistory = task.mileageHistory.slice(-250);
        }
      }
    }
  });
  if (updated) localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
}

function checkTaskArrivals() {
  let updated = false;
  tasks.forEach(task => {
    if (task.status !== "active" || !task.destinationGeofenceId || task.arrivalNotified) return;

    const tag = latestData.find(t => t.mac === task.mac);
    if (!tag || tag.lastLatitude == null) return;

    const gf = geofences.find(g => g.id === task.destinationGeofenceId);
    if (!gf) return;

    const dist = haversine(tag.lastLatitude, tag.lastLongitude, gf.lat, gf.lng) * 1000;
    const arrived = dist <= gf.radius;

    if (arrived && !task.arrivalNotified) {
      task.arrivedAt = new Date().toISOString();
      task.arrivalNotified = true;
      updated = true;

      const alias = tagAliases[task.mac] || task.mac;
      pushAlert("🎯", `${task.name}${task.shipmentNo ? ` (${task.shipmentNo})` : ""} 已抵達「${gf.name}」`, "success");
      showToast(`任務「${task.name}」已抵達目的地`, "success");
      addEvent("info", `任務「${task.name}」已抵達 ${gf.name}`);

      triggerWebhook("arrival", {
        taskId: task.id,
        taskName: task.name,
        shipmentNo: task.shipmentNo,
        mac: task.mac,
        alias,
        geofenceName: gf.name,
        arrivedAt: task.arrivedAt,
        totalMileageKm: task.totalMileageKm.toFixed(2)
      });

      renderTaskList();
    }
  });
  if (updated) localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
}

function completeTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.status = "done";
  task.completedAt = new Date().toISOString();

  localStorage.setItem("utfind_tasks", JSON.stringify(tasks));
  renderTaskList();

  const mileage = task.totalMileageKm.toFixed(2);
  addAudit(`完成任務: ${task.name}${task.shipmentNo ? ` (${task.shipmentNo})` : ""} - 里程: ${mileage} km`);
  showToast(`任務「${task.name}」已完成，總里程 ${mileage} km`, "success");
}

function viewTaskMileage(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const destGf = task.destinationGeofenceId ? geofences.find(g => g.id === task.destinationGeofenceId) : null;

  const info = `
任務: ${task.name}
${task.shipmentNo ? `運單號: ${task.shipmentNo}\n` : ""}
總里程: ${task.totalMileageKm.toFixed(2)} km
起點: ${task.startPosition ? `${task.startPosition.lat.toFixed(4)}, ${task.startPosition.lng.toFixed(4)}` : "未記錄"}
軌跡點: ${task.mileageHistory.length} 筆
目的地: ${destGf ? destGf.name : "未設定"}
${task.arrivedAt ? `抵達時間: ${new Date(task.arrivedAt).toLocaleString()}` : "尚未抵達"}
${task.completedAt ? `完成時間: ${new Date(task.completedAt).toLocaleString()}` : ""}
  `.trim();

  alert(info);
}

function toggleTaskStatus(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = task.status === "done" ? "active" : "done";
    if (task.status === "active") {
      task.arrivalNotified = false;
      task.arrivedAt = null;
      task.completedAt = null;
    }
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
    const statusClass = t.status === "done" ? "done" : t.arrivedAt ? "arrived" : isOverdue ? "overdue" : "active";
    const statusText = t.status === "done" ? "完成" : t.arrivedAt ? "已抵達" : isOverdue ? "逾期" : "進行中";
    const mileage = t.totalMileageKm ? t.totalMileageKm.toFixed(2) : "0.00";
    const destGf = t.destinationGeofenceId ? geofences.find(g => g.id === t.destinationGeofenceId) : null;

    return `
      <div class="task-card">
        <div class="task-header">
          <span class="task-name" style="${t.status === 'done' ? 'text-decoration:line-through;opacity:0.5;' : ''}">${t.name}</span>
          <span class="task-status-badge ${statusClass}">${statusText}</span>
        </div>
        ${t.shipmentNo ? `<div class="task-shipment">📦 ${t.shipmentNo}</div>` : ""}
        <div class="task-meta">
          📱 ${alias} ${t.deadline ? ` · 截止: ${formatTime(t.deadline)}` : ""}
        </div>
        <div class="task-meta">
          🛣️ ${mileage} km ${destGf ? ` · 目的地: ${destGf.name}` : ""}${t.arrivedAt ? ` · 抵達: ${formatTime(t.arrivedAt)}` : ""}
        </div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
          ${t.status !== "done" ? `<button class="gf-btn" onclick="completeTask('${t.id}')">完成</button>` : `<button class="gf-btn" onclick="toggleTaskStatus('${t.id}')">重啟</button>`}
          <button class="gf-btn" onclick="viewTaskMileage('${t.id}')">里程詳情</button>
          <button class="gf-btn gf-del" onclick="deleteTask('${t.id}')">刪除</button>
        </div>
      </div>
    `;
  }).join("");
}

// ================================================================
//  [H5] 稽核日誌
// ================================================================
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

// ================================================================
//  [E3] 多渠道通知（LINE / Telegram / Webhook）
// ================================================================
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

// 增強 pushAlert 以同時送外部通知（僅 danger 等級）
const _origPushAlert = pushAlert;
pushAlert = function(icon, message, type) {
  _origPushAlert(icon, message, type);
  if (type === "danger" && (notifConfig.webhookUrl || notifConfig.lineToken || notifConfig.telegramToken)) {
    sendExternalNotification(`${icon} ${message}`);
  }
};

// ================================================================
//  [E4] 排程通知
// ================================================================
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

// ================================================================
//  [H3] 第三方整合、API Webhook
// ================================================================
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

// ---------- API Webhook ----------
let webhookConfig = JSON.parse(localStorage.getItem("utfind_webhook_config") || "{}");
let webhookDeliveryLog = JSON.parse(localStorage.getItem("utfind_webhook_log") || "[]");

function saveWebhookConfig() {
  webhookConfig = {
    url: document.getElementById("api-webhook-url").value.trim(),
    events: {
      sos: document.getElementById("wh-sos").checked,
      lowbat: document.getElementById("wh-lowbat").checked,
      temp: document.getElementById("wh-temp").checked,
      geofence: document.getElementById("wh-geofence").checked,
      arrival: document.getElementById("wh-arrival")?.checked ?? true,
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
    ["sos", "lowbat", "temp", "geofence", "arrival"].forEach(k => {
      const el = document.getElementById(`wh-${k}`);
      if (el && webhookConfig.events[k] !== undefined) el.checked = webhookConfig.events[k];
    });
  }
  renderWebhookLog();
}

function triggerWebhook(eventType, payload) {
  if (!webhookConfig.url || !webhookConfig.events || !webhookConfig.events[eventType]) return;

  const logEntry = {
    id: Date.now().toString(),
    eventType,
    payload,
    timestamp: new Date().toISOString(),
    status: "pending"
  };

  fetch(webhookConfig.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: eventType, data: payload, timestamp: logEntry.timestamp }),
  })
  .then(response => {
    logEntry.status = response.ok ? "success" : "failed";
    logEntry.httpStatus = response.status;
    if (response.ok) {
      showToast(`Webhook 發送成功: ${eventType}`, "success", 3000);
    } else {
      showToast(`Webhook 發送失敗: HTTP ${response.status}`, "danger");
    }
  })
  .catch(e => {
    logEntry.status = "error";
    logEntry.error = e.message;
    showToast(`Webhook 錯誤: ${e.message}`, "danger");
    console.log("Webhook trigger error:", e);
  })
  .finally(() => {
    webhookDeliveryLog.unshift(logEntry);
    if (webhookDeliveryLog.length > 100) webhookDeliveryLog.length = 100;
    localStorage.setItem("utfind_webhook_log", JSON.stringify(webhookDeliveryLog));
    renderWebhookLog();
  });
}

function renderWebhookLog() {
  const container = document.getElementById("webhook-log-list");
  if (!container) return;

  if (webhookDeliveryLog.length === 0) {
    container.innerHTML = '<div class="empty-state">尚無 Webhook 記錄</div>';
    return;
  }

  container.innerHTML = webhookDeliveryLog.slice(0, 20).map(entry => {
    const statusIcon = entry.status === "success" ? "✅" : entry.status === "failed" || entry.status === "error" ? "❌" : "⏳";
    const statusClass = entry.status === "success" ? "" : entry.status === "failed" || entry.status === "error" ? "error" : "";
    const time = new Date(entry.timestamp).toLocaleString("zh-TW");
    return `
      <div class="event-item ${statusClass}" style="${entry.status !== 'success' ? 'border-left:3px solid var(--danger);' : 'border-left:3px solid var(--success);'}">
        <span class="event-icon">${statusIcon}</span>
        <div class="event-body">
          <div class="event-msg">${entry.eventType.toUpperCase()} - ${entry.payload.alias || entry.payload.mac || '--'}</div>
          <div class="event-time">${time}${entry.httpStatus ? ` · HTTP ${entry.httpStatus}` : ""}${entry.error ? ` · ${entry.error}` : ""}</div>
        </div>
      </div>
    `;
  }).join("");
}

function clearWebhookLog() {
  webhookDeliveryLog = [];
  localStorage.setItem("utfind_webhook_log", JSON.stringify(webhookDeliveryLog));
  renderWebhookLog();
  showToast("Webhook 記錄已清除", "info");
}

// ================================================================
//  [F3] OTA 韌體更新、E-Ink 標籤
// ================================================================
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

// ---------- E-Ink 標籤顯示 ----------
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

// ================================================================
//  [F5] 資產生命週期
// ================================================================
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

// ================================================================
//  [G3] SLA 監控
// ================================================================
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

// ================================================================
//  [J1] 冷鏈管理
// ================================================================
// ---------- GDP/GSP 合規報告 ----------
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

function generateHACCPReport() {
  // 計算所有有批號綁定的 Tag 風險
  const riskData = latestData.filter(tag => batchBindings[tag.mac]).map(tag => {
    const alias = tagAliases[tag.mac] || tag.mac;
    const batch = batchBindings[tag.mac];
    const zone = tempZones[tag.mac] || { type: "cold", min: TEMP_MIN, max: TEMP_MAX };
    const excursion = excursionTimers[tag.mac] || { totalMinutes: 0 };

    let riskScore = 0;
    let riskFactors = [];

    // 溫度風險
    if (tag.temperature != null) {
      if (tag.temperature < zone.min - 5 || tag.temperature > zone.max + 5) {
        riskScore += 3; riskFactors.push("嚴重溫度偏離");
      } else if (tag.temperature < zone.min || tag.temperature > zone.max) {
        riskScore += 2; riskFactors.push("溫度逸脫");
      }
    }

    // 逸脫時間風險
    if (excursion.totalMinutes >= 30) {
      riskScore += 3; riskFactors.push("逸脫超過30分鐘");
    } else if (excursion.totalMinutes >= 15) {
      riskScore += 2; riskFactors.push("逸脫超過15分鐘");
    } else if (excursion.totalMinutes > 0) {
      riskScore += 1; riskFactors.push("短暫逸脫");
    }

    // 電量風險
    if ((tag.lastBatteryLevel ?? 100) <= 10) {
      riskScore += 2; riskFactors.push("電量極低");
    } else if ((tag.lastBatteryLevel ?? 100) <= 20) {
      riskScore += 1; riskFactors.push("低電量");
    }

    // 效期風險
    if (batch.expiry) {
      const daysToExpiry = Math.ceil((new Date(batch.expiry) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToExpiry < 0) {
        riskScore += 3; riskFactors.push("已過期");
      } else if (daysToExpiry <= 7) {
        riskScore += 2; riskFactors.push(`${daysToExpiry}天後到期`);
      } else if (daysToExpiry <= 30) {
        riskScore += 1; riskFactors.push(`${daysToExpiry}天後到期`);
      }
    }

    const riskLevel = riskScore >= 5 ? "high" : riskScore >= 2 ? "medium" : "low";
    const riskLevelText = riskScore >= 5 ? "高風險" : riskScore >= 2 ? "中風險" : "低風險";

    return { mac: tag.mac, alias, batch, zone, excursion, tag, riskScore, riskFactors, riskLevel, riskLevelText };
  });

  if (riskData.length === 0) {
    showToast("尚無綁定批號的 Tag，無法產生 HACCP 報告", "warning");
    return;
  }

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>HACCP 風險評估報告</title>
    <style>
      body{font-family:sans-serif;padding:30px;color:#333;max-width:900px;margin:0 auto;}
      h1{color:#ef4444;font-size:20px;text-align:center;}
      .subtitle{text-align:center;color:#666;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;margin:16px 0;font-size:11px;}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;}
      th{background:#f0f2f5;font-weight:600;}
      .risk-high{background:#fee2e2;color:#dc2626;font-weight:700;}
      .risk-medium{background:#fef3c7;color:#d97706;font-weight:600;}
      .risk-low{background:#d1fae5;color:#059669;}
      .section{margin:20px 0;}
      .section h2{font-size:14px;color:#333;border-bottom:2px solid #ef4444;padding-bottom:4px;}
      .ccp{background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:4px;margin:10px 0;}
      .ccp-title{font-weight:700;color:#dc2626;margin-bottom:6px;}
      .stamp{text-align:center;margin:30px 0;font-size:11px;color:#999;}
      @media print{body{padding:10px;} .no-print{display:none;}}
    </style></head><body>
    <h1>HACCP 風險評估報告</h1>
    <p class="subtitle">Hazard Analysis and Critical Control Points — 危害分析重要管制點</p>

    <div class="section"><h2>風險矩陣總覽</h2>
    <table>
      <tr><th>Tag</th><th>批號</th><th>溫層</th><th>當前溫度</th><th>逸脫時間</th><th>風險分數</th><th>風險等級</th><th>風險因子</th></tr>
      ${riskData.map(r => `
        <tr class="risk-${r.riskLevel}">
          <td>${r.alias}</td>
          <td>${r.batch.batchNo}</td>
          <td>${r.zone.type === "cold" ? "冷藏" : r.zone.type === "frozen" ? "冷凍" : "常溫"} (${r.zone.min}~${r.zone.max}°C)</td>
          <td>${r.tag.temperature ?? "--"}°C</td>
          <td>${r.excursion.totalMinutes.toFixed(1)} 分鐘</td>
          <td>${r.riskScore}</td>
          <td>${r.riskLevelText}</td>
          <td>${r.riskFactors.join(", ") || "無"}</td>
        </tr>
      `).join("")}
    </table></div>

    <div class="section"><h2>關鍵控制點 (CCP)</h2>
    <div class="ccp"><div class="ccp-title">CCP-1: 收貨溫度驗證</div>驗證要求：冷藏品需維持 2-8°C，冷凍品需維持 -25~-15°C</div>
    <div class="ccp"><div class="ccp-title">CCP-2: 運輸溫度監控</div>監控頻率：每 5 分鐘記錄一次，逸脫累計不得超過 30 分鐘</div>
    <div class="ccp"><div class="ccp-title">CCP-3: 交接溫度快照</div>每次交接需記錄當下溫度與簽收人</div>
    </div>

    <div class="section"><h2>矯正措施建議</h2>
    <ul>
      ${riskData.filter(r => r.riskScore >= 2).map(r =>
        `<li><strong>${r.alias}</strong> (${r.batch.batchNo}): ${r.riskFactors.join("; ")} — 建議: ${
          r.riskScore >= 5 ? "立即隔離批次，啟動銷毀程序" : "加強監控，準備備用冷藏設備"
        }</li>`
      ).join("") || "<li>所有批次目前為低風險狀態</li>"}
    </ul></div>

    <div class="stamp">本報告由 UTFind IoT Dashboard HACCP 模組自動產出 · ${new Date().toLocaleString()}</div>
    </body></html>`);
  win.document.close();
  win.print();
  addAudit("產出 HACCP 風險報告");
  addEvent("info", "產出 HACCP 風險評估報告");
}

async function generateBatchTraceabilityReport() {
  const mac = document.getElementById("gdp-tag-select").value;
  if (!mac) { showToast("請選擇 Tag", "warning"); return; }

  const batch = batchBindings[mac];
  if (!batch) { showToast("此 Tag 尚未綁定批號", "warning"); return; }

  const alias = tagAliases[mac] || mac;
  const zone = tempZones[mac] || { type: "cold", min: TEMP_MIN, max: TEMP_MAX };
  const handovers = handoverRecords.filter(h => h.mac === mac);
  const tag = latestData.find(t => t.mac === mac);

  showToast("正在載入完整溫度歷史...", "info", 3000);

  // 使用現有歷史資料
  let historyPoints = [];
  const tagHistory = historyRawData.find(h => h.mac === mac);
  if (tagHistory && tagHistory.data) {
    historyPoints = tagHistory.data;
  }

  // 計算統計
  const temps = historyPoints.filter(p => p.temperature != null).map(p => p.temperature);
  const minTemp = temps.length > 0 ? Math.min(...temps) : null;
  const maxTemp = temps.length > 0 ? Math.max(...temps) : null;
  const avgTemp = temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;

  const excursionPoints = historyPoints.filter(p =>
    p.temperature != null && (p.temperature < zone.min || p.temperature > zone.max)
  );

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>批號追溯報告 - ${batch.batchNo}</title>
    <style>
      body{font-family:sans-serif;padding:30px;color:#333;max-width:900px;margin:0 auto;}
      h1{color:#3b82f6;font-size:20px;text-align:center;}
      .subtitle{text-align:center;color:#666;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;margin:16px 0;font-size:11px;}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
      th{background:#f0f2f5;font-weight:600;}
      .section{margin:20px 0;}
      .section h2{font-size:14px;color:#333;border-bottom:2px solid #3b82f6;padding-bottom:4px;}
      .pass{color:#22c55e;font-weight:700;} .fail{color:#ef4444;font-weight:700;}
      .stamp{text-align:center;margin:30px 0;font-size:11px;color:#999;}
      @media print{body{padding:10px;}}
    </style></head><body>
    <h1>批號全程追溯報告</h1>
    <p class="subtitle">Batch Traceability Report — 完整溫度歷史與監管鏈</p>

    <div class="section"><h2>批號資訊</h2>
    <table>
      <tr><th>批號</th><td>${batch.batchNo}</td><th>綁定 Tag</th><td>${alias} (${mac})</td></tr>
      <tr><th>綁定時間</th><td>${batch.bindDate ? new Date(batch.bindDate).toLocaleString() : "--"}</td><th>效期</th><td>${batch.expiry || "未設定"}</td></tr>
      <tr><th>溫層要求</th><td colspan="3">${zone.type === "cold" ? "冷藏" : zone.type === "frozen" ? "冷凍" : "常溫"} (${zone.min}~${zone.max}°C)</td></tr>
    </table></div>

    <div class="section"><h2>溫度統計</h2>
    <table>
      <tr><th>項目</th><th>數值</th><th>合規</th></tr>
      <tr><td>記錄點數</td><td>${historyPoints.length}</td><td>--</td></tr>
      <tr><td>最低溫度</td><td>${minTemp ?? "--"}°C</td><td class="${minTemp != null && minTemp >= zone.min ? "pass" : "fail"}">${minTemp != null && minTemp >= zone.min ? "PASS" : "需審查"}</td></tr>
      <tr><td>最高溫度</td><td>${maxTemp ?? "--"}°C</td><td class="${maxTemp != null && maxTemp <= zone.max ? "pass" : "fail"}">${maxTemp != null && maxTemp <= zone.max ? "PASS" : "需審查"}</td></tr>
      <tr><td>平均溫度</td><td>${avgTemp ?? "--"}°C</td><td>--</td></tr>
      <tr><td>逸脫點數</td><td>${excursionPoints.length}</td><td class="${excursionPoints.length === 0 ? "pass" : "fail"}">${excursionPoints.length === 0 ? "PASS" : "需審查"}</td></tr>
    </table></div>

    <div class="section"><h2>交接紀錄</h2>
    ${handovers.length > 0 ? `<table><tr><th>#</th><th>時間</th><th>簽收人</th><th>溫度快照</th></tr>
    ${handovers.map((h, i) => `<tr><td>${i + 1}</td><td>${new Date(h.time).toLocaleString()}</td><td>${h.person}</td><td>${h.tempSnapshot ?? "--"}°C</td></tr>`).join("")}</table>` : "<p>無交接紀錄</p>"}</div>

    <div class="section"><h2>溫度歷史 (最近 50 筆)</h2>
    ${historyPoints.length > 0 ? `<table><tr><th>時間</th><th>溫度</th><th>位置</th><th>狀態</th></tr>
    ${historyPoints.slice(0, 50).map(p => {
      const inRange = p.temperature == null || (p.temperature >= zone.min && p.temperature <= zone.max);
      return `<tr><td>${new Date(p.lastRequestDate).toLocaleString()}</td><td>${p.temperature ?? "--"}°C</td><td>${p.lastLatitude?.toFixed(4) ?? "--"}, ${p.lastLongitude?.toFixed(4) ?? "--"}</td><td class="${inRange ? "pass" : "fail"}">${inRange ? "正常" : "逸脫"}</td></tr>`;
    }).join("")}</table>` : "<p>無歷史資料，請先查詢歷史軌跡</p>"}</div>

    <div class="stamp">本報告由 UTFind IoT Dashboard 批次追溯模組自動產出 · ${new Date().toLocaleString()}</div>
    </body></html>`);
  win.document.close();
  win.print();
  addAudit(`產出批號追溯報告: ${batch.batchNo}`);
  addEvent("info", `產出 ${alias} 的批號追溯報告`);
}

// ---------- 溫度逸脫計時器 ----------
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
        pushAlert("⚠️", `${tagAliases[tag.mac] || tag.mac} 溫度逸脫超過 30 分鐘，批次可能需作廢`, "danger");
        playAlertSound(600, 2);
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

// ---------- 批號綁定 ----------
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

// ---------- 交接簽收鏈 ----------
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

// ---------- 多段溫層 ----------
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

// ---------- HACCP 風險矩陣 ----------
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

// ---------- 效期倒數 ----------
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

// ================================================================
//  [J2] 物流追蹤
// ================================================================
// ---------- 籠車週轉率 ----------
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

// ---------- 門市滯留預警 ----------
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

// ---------- 路線偏離偵測 ----------
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

// ---------- 裝載率 ----------
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

// ---------- ETA 預測 ----------
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

// ---------- 資產盤點 ----------
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

// ---------- 調度大屏 ----------
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

// ================================================================
//  [G4] 碳足跡計算
// ================================================================
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

// ================================================================
//  [K5] 語音播報、QR Code 配對
// ================================================================
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

// ---------- 圍欄自動簽到/簽退 ----------
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

// ---------- 多租戶白標 ----------
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

// ---------- QR Code 掃碼配對 ----------
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

// ---------- 客戶自助查詢入口 ----------
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

// ---------- 版本歷程 ----------
const VERSION_HISTORY = [
  {
    version: "v4.5.0", type: "minor", title: "多租戶管理介面",
    changes: [
      "[新增] 多租戶管理面板 — Super Admin 可管理所有租戶",
      "[新增] 租戶 CRUD — 建立/檢視/編輯/暫停/刪除租戶",
      "[新增] 租戶使用者管理 — 邀請/編輯/移除組織內使用者",
      "[新增] 租戶裝置管理 — 綁定/解綁/檢視裝置狀態",
      "[新增] 租戶 API 金鑰管理 — 建立/撤銷 API 金鑰",
      "[新增] 用量統計面板 — 每日 API 呼叫數、裝置配額使用率",
      "[新增] 平台分析儀表板 — 總租戶數/用戶數/裝置數/API 呼叫量",
      "[新增] 稽核日誌 — 記錄所有管理操作的完整審計軌跡",
      "[新增] RBAC 權限系統 — Admin/Operator/User 三層角色",
      "[新增] 租戶使用者認證 — 獨立登入流程、JWT 驗證",
      "[新增] tenant_users/permissions/role_permissions/audit_logs 資料表",
      "[新增] RLS 策略 — 資料庫層級的租戶資料隔離",
    ],
  },
  {
    version: "v4.4.0", type: "minor", title: "報表排程自動寄送",
    changes: [
      "[新增] 報表排程系統 — 自動產生並寄送定期報告",
      "[新增] 支援五種報表類型 — 溫度逸脫/圍欄事件/任務完成/HACCP合規/批號追溯",
      "[新增] 排程頻率選項 — 每日/每週/每月可自訂執行時間",
      "[新增] 資料範圍選項 — 過去24小時/7天/30天/上月",
      "[新增] 多收件人支援 — 可設定多個Email收件者",
      "[新增] PDF報告生成 — 自動產生含圖表的PDF報告",
      "[新增] Email自動寄送 — 使用Resend API發送報告",
      "[新增] 手動觸發功能 — 可立即執行任意排程",
      "[新增] 報告預覽 — 建立排程前可預覽報告內容",
      "[新增] 執行歷史記錄 — 顯示近期報告執行狀態",
      "[新增] 排程啟停控制 — 可暫停/啟用個別排程",
      "[新增] 後端排程服務 — 使用node-cron定時檢查執行",
    ],
  },
  {
    version: "v4.3.0", type: "minor", title: "即時聊天系統",
    changes: [
      "[新增] 即時聊天功能 — 團隊成員即時溝通協作",
      "[新增] 對話類型 — 私訊 / 群組 / 告警三種對話模式",
      "[新增] 告警轉對話 — 從告警直接建立討論群組",
      "[新增] 位置分享 — 在對話中分享 Tag 即時位置",
      "[新增] 未讀計數 — 導航列顯示未讀訊息數量",
      "[新增] 線上使用者 — 即時顯示團隊成員上線狀態",
      "[新增] 訊息類型 — 文字/系統/告警/位置四種訊息",
      "[新增] Supabase Realtime — 支援即時訊息推播（需啟用）",
      "[新增] 聊天 API — conversations/messages/participants/users",
      "[新增] 資料庫結構 — chat_users/conversations/messages/conversation_participants",
    ],
  },
  {
    version: "v4.2.0", type: "minor", title: "Webhook 修復 + 冷鏈強化 + 告警確認 + 任務里程",
    changes: [
      "[修復] Webhook 整合 — triggerWebhook() 現在正確觸發 SOS/低電量/溫度/圍欄事件",
      "[新增] Webhook 發送記錄面板 — 顯示發送狀態、HTTP 回應、錯誤訊息",
      "[新增] Webhook 成功/失敗 Toast 通知即時回饋",
      "[新增] HACCP 風險評估報告 — 風險矩陣、CCP 控制點、矯正措施建議",
      "[新增] 批號全程追溯報告 — 完整溫度歷史、統計分析、交接紀錄",
      "[新增] 告警確認工作流程 — 確認人、確認時間、備註記錄",
      "[新增] 告警篩選 — 待處理/已確認/全部 快速切換",
      "[新增] 告警持久化 — 重新整理頁面後保留告警記錄",
      "[新增] 任務運單號綁定 — 訂單/運單號欄位關聯追蹤",
      "[新增] 任務目的地圍欄 — 選擇目的地自動偵測抵達",
      "[新增] 任務里程追蹤 — 自動累計行駛距離（GPS 計算）",
      "[新增] 任務抵達通知 — 進入目的地圍欄自動推播告警",
      "[新增] 任務抵達 Webhook — arrival 事件類型支援",
      "[新增] 里程詳情查看 — 起點、軌跡點數、總里程、抵達時間",
    ],
  },
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

// ================================================================
//  面板初始化
// ================================================================
// ---------- 報表面板初始化 ----------
function refreshReportsPanel() {
  renderHealthScores();
  renderBatteryPrediction();
  renderAnomalyList();
  populateAIPredictSelect();
}

// ---------- 群組面板初始化 ----------
function refreshGroupsPanel() {
  populateGroupCheckboxes();
  renderGroupList();
  populateTaskTagSelect();
  populateTaskDestinationSelect();
  renderTaskList();
  renderAssetList();
}

// ---------- 設定面板初始化 ----------
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

// ---------- 冷鏈面板初始化 ----------
function refreshColdChainPanel() {
  populateColdChainSelects();
  renderExcursionList();
  renderBatchList();
  renderHandoverList();
  renderTempZoneList();
  renderHACCPMatrix();
  renderExpiryCountdown();
}

// ---------- 物流面板初始化 ----------
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

// ---------- DEMO 假資料（冷鏈 + 物流） ----------
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

// ================================================================
//  [H1] 多帳戶切換
// ================================================================
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

// ================================================================
//  [E2] 告警規則引擎
// ================================================================
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

const ruleAlertSent = new Set();
function evaluateAlertRules() {
  alertRules.filter(r => r.enabled).forEach(rule => {
    latestData.forEach(tag => {
      const a = checkCondition(tag, rule.condA, rule.threshold);
      const b = rule.condB ? checkCondition(tag, rule.condB, rule.threshold) : false;
      const triggered = rule.condB ? (rule.logic === "and" ? a && b : a || b) : a;
      const key = `${rule.id}_${tag.mac}`;
      if (triggered && !ruleAlertSent.has(key)) {
        ruleAlertSent.add(key);
        const alias = tagAliases[tag.mac] || tag.mac;
        addEvent("rule", `規則「${rule.name}」觸發: ${alias}`);
        pushAlert("⚠️", `規則「${rule.name}」觸發: ${alias}`, "danger");
        playAlertSound(700, 2);
      }
      if (!triggered) ruleAlertSent.delete(key);
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

// ================================================================
//  [H4] 批次 CSV 匯入
// ================================================================
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

// ================================================================
//  [I1] 品牌白標主題 / Logo 上傳
// ================================================================
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
  const banner = document.getElementById("brand-banner");
  if (banner) { banner.innerHTML = ""; banner.style.display = "none"; }
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
  // 更新面板頂部品牌 banner
  const banner = document.getElementById("brand-banner");
  if (banner) {
    if (brandTheme.logoImage || brandTheme.company) {
      if (brandTheme.logoImage) {
        banner.innerHTML = `<img src="${brandTheme.logoImage}" alt="Banner" />`;
        banner.className = "brand-banner";
        banner.style.display = "block";
      } else {
        banner.style.display = "none";
      }
    } else {
      banner.style.display = "none";
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

// ================================================================
//  [K1] AI 行為預測
// ================================================================
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

// ================================================================
//  [G2] 數據比對報告
// ================================================================
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

// ---------- 地圖自訂標註 (POI) ----------
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

// ================================================================
//  [K2] 即時共享連結
// ================================================================
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

// ---------- 離線模式 ----------
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

// ================================================================
//  [K4] 自訂 KPI 排列（拖曳）
// ================================================================
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

// ================================================================
//  [I2] 產業情境 Demo（8 產業）
// ================================================================
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

// ================================================================
//  感測器管理（前端）
// ================================================================
function populateSensorSelects() {
  ["sensor-bind-mac", "sensor-push-mac"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || allTags.length === 0) return;
    sel.innerHTML = allTags.map(t => {
      const alias = tagAliases[t.mac] ? ` (${tagAliases[t.mac]})` : "";
      return `<option value="${t.mac}">${t.mac}${alias}</option>`;
    }).join("");
  });
}

async function addSensorBinding() {
  const mac = document.getElementById("sensor-bind-mac")?.value;
  const sensor_type = document.getElementById("sensor-bind-type")?.value;
  const device_name = document.getElementById("sensor-bind-name")?.value;
  const min_threshold = parseFloat(document.getElementById("sensor-bind-min")?.value);
  const max_threshold = parseFloat(document.getElementById("sensor-bind-max")?.value);

  if (!mac) { showToast("請選擇 Tag", "warning"); return; }

  try {
    const resp = await fetch("/api/sensors/bindings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mac, sensor_type, device_name, min_threshold, max_threshold }),
    });
    const data = await resp.json();
    if (data.error) { showToast(data.error, "warning"); return; }
    showToast("感測器綁定成功", "success");
    loadSensorBindings();
  } catch (e) {
    showToast("綁定失敗：Supabase 尚未設定", "warning");
  }
}

async function loadSensorBindings() {
  const container = document.getElementById("sensor-binding-list");
  if (!container) return;
  try {
    const resp = await fetch("/api/sensors/bindings");
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '<div class="empty-state">尚未綁定感測器</div>';
      return;
    }
    const typeLabels = { temperature: "溫度", humidity: "濕度", all: "溫溼度", pressure: "氣壓" };
    container.innerHTML = data.map(b => `
      <div class="geofence-item">
        <div>
          <strong>${b.device_name || b.mac}</strong>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${typeLabels[b.sensor_type] || b.sensor_type}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${b.min_threshold ?? ""}~${b.max_threshold ?? ""}</span>
        </div>
        <button class="btn-ghost-sm" onclick="removeSensorBinding('${b.id}')">刪除</button>
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<div class="empty-state">Supabase 尚未設定</div>';
  }
}

async function removeSensorBinding(id) {
  try {
    await fetch("/api/sensors/bindings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadSensorBindings();
  } catch {}
}

async function pushSensorData() {
  const mac = document.getElementById("sensor-push-mac")?.value;
  const temperature = document.getElementById("sensor-push-temp")?.value;
  const humidity = document.getElementById("sensor-push-humid")?.value;
  const status = document.getElementById("sensor-push-status");

  if (!mac) { showToast("請選擇 Tag", "warning"); return; }
  if (!temperature && !humidity) { showToast("至少填入溫度或濕度", "warning"); return; }

  try {
    const resp = await fetch("/api/sensors/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mac,
        temperature: temperature ? parseFloat(temperature) : null,
        humidity: humidity ? parseFloat(humidity) : null,
        source: "manual",
      }),
    });
    const data = await resp.json();
    if (data.error) { if (status) { status.className = "status error"; status.textContent = data.error; } return; }

    if (status) {
      status.className = "status success";
      status.textContent = `已記錄！${data.alerts?.length ? `⚠️ ${data.alerts.length} 筆超閾值告警` : ""}`;
    }

    // 如果有告警推送到面板
    (data.alerts || []).forEach(a => {
      const alias = tagAliases[mac] || mac;
      pushAlert("🌡️", `${alias} ${a.type.includes("high") ? "超過上限" : "低於下限"} (${a.value}，閾值 ${a.threshold})`, "danger");
      playAlertSound(600, 2);
    });

    // 清空輸入
    document.getElementById("sensor-push-temp").value = "";
    document.getElementById("sensor-push-humid").value = "";
  } catch (e) {
    if (status) { status.className = "status error"; status.textContent = "推送失敗：Supabase 尚未設定"; }
  }
}

// 更新感測器來源標記
function updateSensorSourceBadge() {
  const badge = document.getElementById("sensor-source-badge");
  if (!badge) return;
  badge.textContent = useFakeSensors ? "目前使用：模擬資料" : "目前使用：Supabase";
  badge.style.color = useFakeSensors ? "var(--warning)" : "var(--success)";
}

// ---------- Enter 鍵快捷連線 ----------
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

// ================================================================
//  側邊欄區塊折疊功能
// ================================================================
(function initCollapsibleSections() {
  document.querySelectorAll(".report-section").forEach(section => {
    const title = section.querySelector(".section-title");
    if (!title) return;

    // 把 section-title 之後的所有內容包在 section-body 裡
    const body = document.createElement("div");
    body.className = "section-body";
    const children = [...section.childNodes].filter(n => n !== title);
    children.forEach(child => body.appendChild(child));
    section.appendChild(body);

    // 點標題可折疊/展開
    title.addEventListener("click", (e) => {
      // 避免跟已有 onclick 的 section-title 衝突
      if (e.target.closest("button, input, select, a")) return;
      section.classList.toggle("collapsed");
    });
  });
})();

// ================================================================
//  [L1] 尋找 PDA — 透過綁定的 Tag 最後回報位置來定位
// ================================================================
// 邏輯：Tag 透過 PDA 的 GPS 回報位置，所以 Tag 的最後座標 = PDA 的最後位置

let _pdaProfiles = JSON.parse(localStorage.getItem("utfind_pda_profiles") || "[]");
let _pdaMapLayers = [];

// 初始化：渲染已建立的 PDA 列表和搜尋下拉
(function initFindPda() {
  renderPdaProfiles();
  renderPdaSearchSelect();
})();

// ---------- PDA Tag 選擇框（連線後才有資料） ----------
function populatePdaTagCheckboxes() {
  const container = document.getElementById("pda-tag-checkboxes");
  if (!container || allTags.length === 0) return;
  container.innerHTML = allTags.map(t => {
    const alias = tagAliases[t.mac] || "";
    const label = alias ? `${alias} (${t.mac})` : t.mac;
    return `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;cursor:pointer;">
      <input type="checkbox" class="pda-tag-cb" value="${t.mac}" /> ${label}
    </label>`;
  }).join("");
}

// ---------- 儲存 PDA Profile ----------
function savePdaProfile() {
  const nameInput = document.getElementById("pda-profile-name");
  const st = document.getElementById("pda-profile-status");
  const name = (nameInput.value || "").trim();
  if (!name) { st.className = "status error"; st.textContent = "請輸入 PDA 名稱"; return; }

  const checkedMacs = [...document.querySelectorAll(".pda-tag-cb:checked")].map(cb => cb.value);
  if (checkedMacs.length === 0) { st.className = "status error"; st.textContent = "請至少綁定一個 Tag"; return; }

  // 檢查是否已存在同名
  const existing = _pdaProfiles.findIndex(p => p.name === name);
  if (existing >= 0) {
    _pdaProfiles[existing].macs = checkedMacs;
  } else {
    _pdaProfiles.push({ id: Date.now().toString(36), name, macs: checkedMacs });
  }
  localStorage.setItem("utfind_pda_profiles", JSON.stringify(_pdaProfiles));

  nameInput.value = "";
  document.querySelectorAll(".pda-tag-cb:checked").forEach(cb => cb.checked = false);
  st.className = "status success";
  st.textContent = `已儲存 PDA: ${name}（綁定 ${checkedMacs.length} 個 Tag）`;
  renderPdaProfiles();
  renderPdaSearchSelect();
  showToast(`PDA "${name}" 已建立`, "success");
}

// ---------- 渲染 PDA 列表 ----------
function renderPdaProfiles() {
  const container = document.getElementById("pda-profile-list");
  if (!container) return;
  if (_pdaProfiles.length === 0) {
    container.innerHTML = '<div class="empty-state">尚未建立 PDA 資料</div>';
    return;
  }
  container.innerHTML = _pdaProfiles.map(p => {
    const tagLabels = p.macs.slice(0, 3).map(m => tagAliases[m] || m.slice(-8));
    const more = p.macs.length > 3 ? ` +${p.macs.length - 3}` : "";
    return `<div class="geofence-item">
      <div style="flex:1;">
        <strong>${p.name}</strong>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
          ${p.macs.length} 個 Tag: ${tagLabels.join(", ")}${more}
        </div>
      </div>
      <button class="btn-ghost-sm" onclick="deletePdaProfile('${p.id}')" title="刪除">刪除</button>
    </div>`;
  }).join("");
}

function deletePdaProfile(id) {
  _pdaProfiles = _pdaProfiles.filter(p => p.id !== id);
  localStorage.setItem("utfind_pda_profiles", JSON.stringify(_pdaProfiles));
  renderPdaProfiles();
  renderPdaSearchSelect();
  showToast("已刪除 PDA", "info");
}

function renderPdaSearchSelect() {
  const select = document.getElementById("pda-search-target");
  if (!select) return;
  if (_pdaProfiles.length === 0) {
    select.innerHTML = '<option value="">-- 請先建立 PDA --</option>';
    return;
  }
  select.innerHTML = '<option value="">-- 選擇 PDA --</option>' +
    _pdaProfiles.map(p => `<option value="${p.id}">${p.name} (${p.macs.length} Tags)</option>`).join("");
}

// ---------- 搜尋 PDA：查綁定 Tag 的最後位置 ----------
async function searchPda() {
  const profileId = document.getElementById("pda-search-target").value;
  const radius = parseInt(document.getElementById("pda-search-radius").value) || 100;
  const st = document.getElementById("pda-search-status");
  const resultSection = document.getElementById("pda-result-section");
  const resultList = document.getElementById("pda-result-list");
  const summary = document.getElementById("pda-search-summary");

  if (!profileId) { st.className = "status error"; st.textContent = "請先選擇 PDA"; return; }
  const profile = _pdaProfiles.find(p => p.id === profileId);
  if (!profile) { st.className = "status error"; st.textContent = "PDA 不存在"; return; }

  st.className = "status info";
  st.innerHTML = '<span class="spinner"></span>查詢綁定 Tag 的最後位置...';
  clearPdaSearch();

  try {
    // 查詢綁定 Tag 的最新位置（用現有的 UTFind API）
    const result = await apiCall("latest", { macs: profile.macs });
    const tagData = Array.isArray(result) ? result.filter(t => t.lastLatitude && t.lastLongitude) : [];

    if (tagData.length === 0) {
      st.className = "status info"; st.textContent = "綁定的 Tag 目前沒有位置資料";
      resultSection.style.display = "none";
      return;
    }

    // 依最後更新時間排序（最新在前）
    tagData.sort((a, b) => new Date(b.lastRequestDate) - new Date(a.lastRequestDate));

    // 計算所有 Tag 位置的質心 = PDA 最可能的位置
    const centerLat = tagData.reduce((s, t) => s + t.lastLatitude, 0) / tagData.length;
    const centerLng = tagData.reduce((s, t) => s + t.lastLongitude, 0) / tagData.length;

    // 找出最近更新的 Tag
    const newestTag = tagData[0];
    const newestTime = new Date(newestTag.lastRequestDate);
    const timeDiff = Date.now() - newestTime.getTime();
    const isStale = timeDiff > 30 * 60000; // 超過 30 分鐘沒更新

    // 地圖上標記
    // 1. 搜索範圍（在質心畫圈）
    const searchCircle = L.circle([centerLat, centerLng], {
      radius: radius,
      color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.12,
      weight: 2, dashArray: "6,4",
    }).addTo(map);
    _pdaMapLayers.push(searchCircle);

    // 2. PDA 推估位置
    const pdaMarker = L.marker([centerLat, centerLng], { icon: createPdaIcon("lost") })
      .addTo(map)
      .bindPopup(`<strong>${profile.name}</strong><br>推估位置（${tagData.length} 個 Tag 質心）<br>搜索半徑: ${radius}m`)
      .openPopup();
    _pdaMapLayers.push(pdaMarker);

    // 3. 每個 Tag 的位置
    tagData.forEach((t, idx) => {
      const alias = tagAliases[t.mac] || t.mac;
      const isNewest = idx === 0;
      const tagMarker = L.circleMarker([t.lastLatitude, t.lastLongitude], {
        radius: 8,
        color: isNewest ? "#ef4444" : "#6366f1",
        fillColor: isNewest ? "#ef4444" : "#6366f1",
        fillOpacity: isNewest ? 0.9 : 0.5,
        weight: 2,
      }).addTo(map).bindPopup(
        `<strong>${alias}</strong><br>` +
        `最後更新: ${new Date(t.lastRequestDate).toLocaleString()}<br>` +
        `電量: ${t.lastBatteryLevel}%<br>` +
        `${isNewest ? "⚠ 最近回報的 Tag" : ""}`
      );
      _pdaMapLayers.push(tagMarker);

      // Tag 到質心的連線
      const line = L.polyline([[t.lastLatitude, t.lastLongitude], [centerLat, centerLng]], {
        color: isNewest ? "#ef4444" : "#6366f1", weight: 1, opacity: 0.4, dashArray: "4,4",
      }).addTo(map);
      _pdaMapLayers.push(line);
    });

    map.fitBounds(searchCircle.getBounds(), { padding: [60, 60] });

    // 顯示結果
    resultSection.style.display = "block";
    const statusHtml = isStale
      ? `<span style="color:var(--danger);">已離線 ${Math.round(timeDiff / 60000)} 分鐘，PDA 可能在此區域</span>`
      : `<span style="color:var(--success);">Tag 仍在線，PDA 可能仍在附近</span>`;
    summary.innerHTML = `<strong>${profile.name}</strong> — ${tagData.length} 個 Tag 回報位置<br>${statusHtml}`;

    resultList.innerHTML = tagData.map((t, idx) => {
      const alias = tagAliases[t.mac] || t.mac;
      const time = new Date(t.lastRequestDate);
      const ago = getTimeAgo(t.lastRequestDate);
      const isNewest = idx === 0;
      const dist = haversine(centerLat, centerLng, t.lastLatitude, t.lastLongitude);
      const distStr = dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;

      return `<div class="geofence-item" style="cursor:pointer;border-left:3px solid ${isNewest ? "var(--danger)" : "var(--accent)"};padding-left:10px;${isNewest ? "background:rgba(239,68,68,0.1);" : ""}" onclick="map.setView([${t.lastLatitude},${t.lastLongitude}],18)">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;">
            <strong style="font-size:12px;">${alias}</strong>
            ${isNewest ? '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:var(--danger);color:#fff;">最新</span>' : ""}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
            ${time.toLocaleString()} (${ago})
          </div>
          <div style="font-size:10px;color:var(--text-muted);">
            電量 ${t.lastBatteryLevel}% · 離質心 ${distStr}
          </div>
        </div>
      </div>`;
    }).join("");

    st.className = "status success";
    st.textContent = `PDA 推估位置已標記，最近一個 Tag 回報於 ${getTimeAgo(newestTag.lastRequestDate)}`;

  } catch (e) {
    st.className = "status error"; st.textContent = "搜尋失敗: " + e.message;
  }
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function clearPdaSearch() {
  _pdaMapLayers.forEach(layer => map.removeLayer(layer));
  _pdaMapLayers = [];
}

function createPdaIcon(status) {
  const color = status === "lost" ? "#ef4444" : "#22c55e";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="width:32px;height:32px;background:${color};border:3px solid #fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;${status === "lost" ? "animation:pulse 1s infinite;" : ""}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>
    </div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

// 不再需要 deviceAutoCheckin，移除 fetchLatest 的打卡呼叫
function deviceAutoCheckin() { /* 已停用 */ }

// ================================================================
//  [L] 即時聊天系統 (Real-time Chat)
// ================================================================

// Chat state
let chatCurrentUser = JSON.parse(localStorage.getItem("utfind_chat_user") || "null");
let chatConversations = [];
let chatCurrentConversation = null;
let chatMessages = [];
let chatUsers = [];
let chatSubscription = null;
let chatTabFilter = "all";
let chatUnreadTotal = 0;
let chatPollingIntervalId = null; // Store interval ID for cleanup

// Supabase client for realtime (will be initialized dynamically)
let supabaseClient = null;

// ================================================================
//  [L1] Chat Initialization
// ================================================================

async function initChat() {
  if (!chatCurrentUser) {
    document.getElementById("chat-user-setup").style.display = "block";
    document.getElementById("chat-main").style.display = "none";
    return;
  }

  document.getElementById("chat-user-setup").style.display = "none";
  document.getElementById("chat-main").style.display = "block";

  // Load conversations
  await loadChatConversations();

  // Load online users
  await loadChatUsers();

  // Setup realtime subscription
  await subscribeToMessages();

  // Update user status
  await updateChatUserStatus("online");
}

async function setupChatUser() {
  const nameInput = document.getElementById("chat-user-name");
  const name = (nameInput.value || "").trim();

  if (!name) {
    showToast("Please enter your name", "error");
    return;
  }

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/chat/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@utfind.local` })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create user");
    }

    chatCurrentUser = await resp.json();
    localStorage.setItem("utfind_chat_user", JSON.stringify(chatCurrentUser));

    showToast(`Welcome, ${chatCurrentUser.name}!`, "success");
    addEvent("chat", `Chat user created: ${chatCurrentUser.name}`);

    initChat();
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
}

// ================================================================
//  [L2] Conversations
// ================================================================

async function loadChatConversations() {
  if (!chatCurrentUser) return;

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = {};
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch(`/api/chat/conversations?user_id=${chatCurrentUser.id}`, { headers });
    if (!resp.ok) throw new Error("Failed to load conversations");

    chatConversations = await resp.json();
    renderChatConversationList();
    updateChatUnreadBadge();
  } catch (e) {
    console.error("loadChatConversations error:", e);
  }
}

function renderChatConversationList() {
  const container = document.getElementById("chat-conversation-list");
  if (!container) return;

  // Filter by tab
  let filtered = chatConversations;
  if (chatTabFilter !== "all") {
    filtered = chatConversations.filter(c => c.type === chatTabFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No conversations</div>';
    return;
  }

  container.innerHTML = filtered.map(conv => {
    const isUnread = conv.unread_count > 0;
    const lastMsg = conv.last_message;
    const preview = lastMsg ? (lastMsg.message_type === "system" ? lastMsg.content : `${getInitials(getSenderName(lastMsg, conv))}: ${lastMsg.content}`) : "Start a conversation";
    const time = lastMsg ? formatChatTime(lastMsg.created_at) : "";
    const name = getConversationName(conv);
    const avatarClass = conv.type === "alert" ? "alert" : conv.type === "group" ? "group" : "";

    return `
      <div class="chat-conv-item ${isUnread ? "unread" : ""}" onclick="openChatConversation('${conv.id}')">
        <div class="chat-conv-avatar ${avatarClass}">${getConversationIcon(conv)}</div>
        <div class="chat-conv-info">
          <div class="chat-conv-name">${escapeHtml(name)}</div>
          <div class="chat-conv-preview">${escapeHtml(truncate(preview, 40))}</div>
        </div>
        <div class="chat-conv-meta">
          <span class="chat-conv-time">${time}</span>
          ${isUnread ? `<span class="chat-conv-unread">${conv.unread_count}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function getConversationName(conv) {
  if (conv.name) return conv.name;
  if (conv.type === "alert") return `Alert: ${conv.tag_mac || "Unknown"}`;
  if (conv.type === "direct") {
    const other = conv.conversation_participants?.find(p => p.user_id !== chatCurrentUser?.id);
    return other?.chat_users?.name || "Direct Message";
  }
  return "Group";
}

function getConversationIcon(conv) {
  if (conv.type === "alert") return "!";
  if (conv.type === "group") return conv.name?.[0]?.toUpperCase() || "G";
  const other = conv.conversation_participants?.find(p => p.user_id !== chatCurrentUser?.id);
  return other?.chat_users?.name?.[0]?.toUpperCase() || "?";
}

function getSenderName(msg, conv) {
  if (msg.sender_id === chatCurrentUser?.id) return "You";
  const participant = conv.conversation_participants?.find(p => p.user_id === msg.sender_id);
  return participant?.chat_users?.name || "Unknown";
}

function switchChatTab(tab, btn) {
  chatTabFilter = tab;
  document.querySelectorAll(".chat-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderChatConversationList();
}

// ================================================================
//  [L3] Open Conversation & Messages
// ================================================================

async function openChatConversation(conversationId) {
  chatCurrentConversation = chatConversations.find(c => c.id === conversationId);
  if (!chatCurrentConversation) return;

  // Switch views
  document.getElementById("chat-list-view").style.display = "none";
  document.getElementById("chat-conversation-view").style.display = "block";

  // Set header
  document.getElementById("chat-conv-name").textContent = getConversationName(chatCurrentConversation);
  const participants = chatCurrentConversation.conversation_participants || [];
  document.getElementById("chat-conv-participants").textContent = `${participants.length} participants`;

  // Load messages
  await loadChatMessages(conversationId);

  // Mark as read
  await markChatAsRead(conversationId);
}

async function loadChatMessages(conversationId) {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  container.innerHTML = '<div class="empty-state"><span class="spinner"></span>Loading...</div>';

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = {};
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch(`/api/chat/messages?conversation_id=${conversationId}&limit=100`, { headers });
    if (!resp.ok) throw new Error("Failed to load messages");

    chatMessages = await resp.json();
    renderChatMessages();

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function renderChatMessages() {
  const container = document.getElementById("chat-messages");
  if (!container) return;

  if (chatMessages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
    return;
  }

  container.innerHTML = chatMessages.map(msg => {
    const isOutgoing = msg.sender_id === chatCurrentUser?.id;
    const sender = msg.chat_users || {};
    const time = formatChatTime(msg.created_at);

    if (msg.message_type === "system") {
      return `<div class="chat-msg-system">${escapeHtml(msg.content)}</div>`;
    }

    if (msg.message_type === "alert") {
      const meta = msg.metadata || {};
      return `
        <div class="chat-msg-alert">
          <div class="chat-msg-alert-header">
            <span>Alert</span>
            <span style="font-weight:400;color:var(--text-muted);font-size:10px;">${time}</span>
          </div>
          <div class="chat-msg-alert-body">${escapeHtml(msg.content)}</div>
          ${meta.tag_mac ? `<div style="font-size:10px;margin-top:4px;color:var(--text-muted);">Tag: ${meta.tag_mac}</div>` : ""}
        </div>
      `;
    }

    if (msg.message_type === "location") {
      const meta = msg.metadata || {};
      // Validate coordinates are valid numbers to prevent XSS
      const lat = typeof meta.lat === "number" && isFinite(meta.lat) ? meta.lat : null;
      const lng = typeof meta.lng === "number" && isFinite(meta.lng) ? meta.lng : null;
      const hasValidCoords = lat !== null && lng !== null;
      const onclickHandler = hasValidCoords ? `focusMapLocation(${lat}, ${lng})` : "";
      const coordsDisplay = hasValidCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Invalid coordinates";

      return `
        <div class="chat-message ${isOutgoing ? "outgoing" : ""}">
          ${!isOutgoing ? `<div class="chat-msg-avatar">${getInitials(sender.name)}</div>` : ""}
          <div class="chat-msg-content">
            ${!isOutgoing ? `<div class="chat-msg-sender">${escapeHtml(sender.name || "Unknown")}</div>` : ""}
            <div class="chat-msg-location" ${hasValidCoords ? `onclick="${onclickHandler}"` : ""}>
              <div class="chat-msg-location-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
              <div class="chat-msg-location-text">${escapeHtml(msg.content)}<br><small>${coordsDisplay}</small></div>
            </div>
            <div class="chat-msg-time">${time}</div>
          </div>
          ${isOutgoing ? `<div class="chat-msg-avatar">${getInitials(sender.name)}</div>` : ""}
        </div>
      `;
    }

    return `
      <div class="chat-message ${isOutgoing ? "outgoing" : ""}">
        ${!isOutgoing ? `<div class="chat-msg-avatar">${getInitials(sender.name)}</div>` : ""}
        <div class="chat-msg-content">
          ${!isOutgoing ? `<div class="chat-msg-sender">${escapeHtml(sender.name || "Unknown")}</div>` : ""}
          <div class="chat-msg-bubble">${escapeHtml(msg.content)}</div>
          <div class="chat-msg-time">${time}</div>
        </div>
        ${isOutgoing ? `<div class="chat-msg-avatar">${getInitials(chatCurrentUser?.name)}</div>` : ""}
      </div>
    `;
  }).join("");

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function closeChatConversation() {
  chatCurrentConversation = null;
  chatMessages = [];
  document.getElementById("chat-list-view").style.display = "block";
  document.getElementById("chat-conversation-view").style.display = "none";

  // Refresh list
  loadChatConversations();
}

// ================================================================
//  [L4] Send Message
// ================================================================

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const content = (input.value || "").trim();

  if (!content || !chatCurrentConversation || !chatCurrentUser) return;

  input.value = "";
  input.focus();

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/chat/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_id: chatCurrentConversation.id,
        sender_id: chatCurrentUser.id,
        content,
        message_type: "text"
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to send message");
    }

    const newMsg = await resp.json();

    // Add to local messages and render
    chatMessages.push(newMsg);
    renderChatMessages();

    // Play sound
    if (soundEnabled) {
      try { new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACAgICAgICAgICAgICAgICAgICAgICAgICBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYKCgoKCgoKCgoKCgoKCgoKCgoKCgoKDg4ODg4ODg4ODg4ODg4ODg4ODg4OEhISEhISEhISEhISEhISEhISFhYWFhYWFhYWFhYWFhYWFhYWFhoaGhoaGhoaGhoaGhoaGhoaGhoaGh4eHh4eHh4eHh4eHh4eHh4eIiIiIiIiIiIiIiIiIiIiIiIiIiYmJiYmJiYmJiYmJiYmJiYmJioqKioqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLjIyMjIyMjIyMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjY2NjY2NjY6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Oj4+Pj4+Pj4+Pj4+Pj4+Pj4+PkJCQkJCQkJCQkJCQkJCQkJCQkJGRkZGRkZGRkZGRkZGRkZGRkpKSkpKSkpKSkpKSkpKSkpKSk5OTk5OTk5OTk5OTk5OTk5OTlJSUlJSUlJSUlJSUlJSUlJSUlJWVlZWVlZWVlZWVlZWVlZWVlpaWlpaWlpaWlpaWlpaWlpaWl5eXl5eXl5eXl5eXl5eXl5eXmJiYmJiYmJiYmJiYmJiYmJiYmZmZmZmZmZmZmZmZmZmZmZmZmpqampqampqampqampqampqam5ubm5ubm5ubm5ubm5ubm5ubnJycnJycnJycnJycnJycnJycnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnp6enp6enp6enp6enp6enp6en5+fn5+fn5+fn5+fn5+fn5+foKCgoKCgoKCgoKCgoKCgoKCgoaCgoKCgoKCgoKCgoKCgoKCgoqKioqKioqKioqKioqKioqKio6Ojo6Ojo6Ojo6Ojo6Ojo6OjpKSkpKSkpKSkpKSkpKSkpKSk").play(); } catch {}
    }
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
}

function handleChatKeypress(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

// ================================================================
//  [L5] Mark as Read
// ================================================================

async function markChatAsRead(conversationId) {
  if (!chatCurrentUser) return;

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    await fetch("/api/chat/messages", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        conversation_id: conversationId,
        user_id: chatCurrentUser.id
      })
    });

    // Update local unread count
    const conv = chatConversations.find(c => c.id === conversationId);
    if (conv) {
      conv.unread_count = 0;
      updateChatUnreadBadge();
    }
  } catch (e) {
    console.error("markChatAsRead error:", e);
  }
}

function updateChatUnreadBadge() {
  chatUnreadTotal = chatConversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const badge = document.getElementById("chat-unread-badge");
  if (badge) {
    if (chatUnreadTotal > 0) {
      badge.textContent = chatUnreadTotal > 99 ? "99+" : chatUnreadTotal;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
}

// ================================================================
//  [L6] Realtime Subscription
// ================================================================

async function subscribeToMessages() {
  // Note: For full realtime, you need Supabase JS client in browser
  // This is a polling fallback for server-side API
  if (!chatCurrentUser) return;

  // Clear any existing polling interval to prevent memory leaks
  if (chatPollingIntervalId) {
    clearInterval(chatPollingIntervalId);
    chatPollingIntervalId = null;
  }

  // Poll for new messages every 5 seconds
  chatPollingIntervalId = setInterval(async () => {
    if (document.hidden) return; // Don't poll when tab is hidden

    const previousUnread = chatUnreadTotal;
    await loadChatConversations();

    // If in conversation view, reload messages
    if (chatCurrentConversation) {
      const latestMsgTime = chatMessages[chatMessages.length - 1]?.created_at;
      if (latestMsgTime) {
        try {
          const adminToken = localStorage.getItem("utfind_admin_token") || "";
          const headers = {};
          if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
          else if (apiKey) headers["X-API-Key"] = apiKey;

          const resp = await fetch(`/api/chat/messages?conversation_id=${chatCurrentConversation.id}&after=${latestMsgTime}&limit=50`, { headers });
          if (resp.ok) {
            const newMsgs = await resp.json();
            if (newMsgs.length > 0) {
              chatMessages.push(...newMsgs);
              renderChatMessages();
              markChatAsRead(chatCurrentConversation.id);
            }
          }
        } catch {}
      }
    }

    // Notify if new unread
    if (chatUnreadTotal > previousUnread && soundEnabled) {
      showToast(`New chat message received`, "info");
      if (typeof Audio !== "undefined") {
        try { new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACAgICAgICAgICAgICAgICAgICAgICAgICBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYKCgoKCgoKCgoKCgoKCgoKCgoKCgoKDg4ODg4ODg4ODg4ODg4ODg4ODg4OEhISEhISEhISEhISEhISEhISFhYWFhYWFhYWFhYWFhYWFhYWFhoaGhoaGhoaGhoaGhoaGhoaGhoaGh4eHh4eHh4eHh4eHh4eHh4eIiIiIiIiIiIiIiIiIiIiIiIiIiYmJiYmJiYmJiYmJiYmJiYmJioqKioqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLjIyMjIyMjIyMjIyMjIyMjIyMjIyNjY2NjY2NjY2NjY2NjY2NjY6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Oj4+Pj4+Pj4+Pj4+Pj4+Pj4+PkJCQkJCQkJCQkJCQkJCQkJCQkJGRkZGRkZGRkZGRkZGRkZGRkpKSkpKSkpKSkpKSkpKSkpKSk5OTk5OTk5OTk5OTk5OTk5OTlJSUlJSUlJSUlJSUlJSUlJSUlJWVlZWVlZWVlZWVlZWVlZWVlpaWlpaWlpaWlpaWlpaWlpaWl5eXl5eXl5eXl5eXl5eXl5eXmJiYmJiYmJiYmJiYmJiYmJiYmZmZmZmZmZmZmZmZmZmZmZmZmpqampqampqampqampqampqam5ubm5ubm5ubm5ubm5ubm5ubnJycnJycnJycnJycnJycnJycnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnp6enp6enp6enp6enp6enp6en5+fn5+fn5+fn5+fn5+fn5+foKCgoKCgoKCgoKCgoKCgoKCgoaCgoKCgoKCgoKCgoKCgoKCgoqKioqKioqKioqKioqKioqKio6Ojo6Ojo6Ojo6Ojo6Ojo6OjpKSkpKSkpKSkpKSkpKSkpKSk").play(); } catch {}
      }
    }
  }, 5000);
}

// ================================================================
//  [L7] Online Users
// ================================================================

async function loadChatUsers() {
  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = {};
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/chat/users", { headers });
    if (!resp.ok) throw new Error("Failed to load users");

    chatUsers = await resp.json();
    renderChatOnlineUsers();
  } catch (e) {
    console.error("loadChatUsers error:", e);
  }
}

function renderChatOnlineUsers() {
  const container = document.getElementById("chat-online-users");
  if (!container) return;

  const onlineUsers = chatUsers.filter(u => u.status === "online" || u.status === "away");

  if (onlineUsers.length === 0) {
    container.innerHTML = '<div class="empty-state">No users online</div>';
    return;
  }

  container.innerHTML = onlineUsers.map(user => `
    <div class="chat-user-item" onclick="startDirectChat('${user.id}')">
      <div class="chat-user-avatar">
        ${getInitials(user.name)}
        <span class="chat-user-status ${user.status}"></span>
      </div>
      <span class="chat-user-name">${escapeHtml(user.name)}</span>
      <span class="chat-user-role">${user.role}</span>
    </div>
  `).join("");
}

async function updateChatUserStatus(status) {
  if (!chatCurrentUser) return;

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    await fetch("/api/chat/users", {
      method: "PUT",
      headers,
      body: JSON.stringify({ user_id: chatCurrentUser.id, status })
    });
  } catch {}
}

// ================================================================
//  [L8] Create Conversation
// ================================================================

function openNewChatModal() {
  // Create modal
  const overlay = document.createElement("div");
  overlay.className = "chat-modal-overlay";
  overlay.id = "chat-new-modal";
  overlay.onclick = (e) => { if (e.target === overlay) closeNewChatModal(); };

  const otherUsers = chatUsers.filter(u => u.id !== chatCurrentUser?.id);

  overlay.innerHTML = `
    <div class="chat-modal">
      <div class="chat-modal-header">
        <span class="chat-modal-title">New Conversation</span>
        <button class="chat-modal-close" onclick="closeNewChatModal()">&times;</button>
      </div>
      <div class="chat-modal-body">
        <div class="form-group">
          <label>Type</label>
          <select id="new-chat-type" onchange="toggleNewChatName()">
            <option value="direct">Direct Message</option>
            <option value="group">Group Chat</option>
          </select>
        </div>
        <div class="form-group" id="new-chat-name-group" style="display:none;">
          <label>Group Name</label>
          <input type="text" id="new-chat-name" placeholder="Enter group name" />
        </div>
        <div class="form-group">
          <label>Select Participants</label>
          <div class="chat-user-select-list" id="chat-user-select-list">
            ${otherUsers.length === 0 ? '<div class="empty-state">No other users available</div>' : otherUsers.map(u => `
              <label class="chat-user-select-item">
                <input type="checkbox" value="${u.id}" />
                <div class="chat-user-avatar">${getInitials(u.name)}</div>
                <span>${escapeHtml(u.name)}</span>
              </label>
            `).join("")}
          </div>
        </div>
        <button class="btn-accent" onclick="createNewChat()">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function closeNewChatModal() {
  const modal = document.getElementById("chat-new-modal");
  if (modal) modal.remove();
}

function toggleNewChatName() {
  const type = document.getElementById("new-chat-type").value;
  document.getElementById("new-chat-name-group").style.display = type === "group" ? "block" : "none";
}

async function createNewChat() {
  const type = document.getElementById("new-chat-type").value;
  const name = document.getElementById("new-chat-name")?.value || "";
  const checkboxes = document.querySelectorAll("#chat-user-select-list input:checked");
  const participantIds = Array.from(checkboxes).map(cb => cb.value);

  if (participantIds.length === 0) {
    showToast("Please select at least one participant", "error");
    return;
  }

  if (type === "direct" && participantIds.length > 1) {
    showToast("Direct message can only have one recipient", "error");
    return;
  }

  // Add current user to participants
  participantIds.push(chatCurrentUser.id);

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/chat/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type,
        name: type === "group" ? name : null,
        created_by: chatCurrentUser.id,
        participant_ids: participantIds
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create conversation");
    }

    const newConv = await resp.json();

    closeNewChatModal();
    showToast("Conversation created", "success");
    addEvent("chat", `Created ${type} conversation`);

    // Reload and open
    await loadChatConversations();
    openChatConversation(newConv.id);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
}

async function startDirectChat(userId) {
  // Check if direct conversation exists
  const existing = chatConversations.find(c =>
    c.type === "direct" &&
    c.conversation_participants?.some(p => p.user_id === userId) &&
    c.conversation_participants?.some(p => p.user_id === chatCurrentUser?.id)
  );

  if (existing) {
    openChatConversation(existing.id);
    return;
  }

  // Create new direct conversation
  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    const resp = await fetch("/api/chat/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "direct",
        created_by: chatCurrentUser.id,
        participant_ids: [chatCurrentUser.id, userId]
      })
    });

    if (!resp.ok) throw new Error("Failed to create conversation");

    const newConv = await resp.json();
    await loadChatConversations();
    openChatConversation(newConv.id);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
}

// ================================================================
//  [L9] Alert to Chat Conversion
// ================================================================

async function createAlertConversation(alertData) {
  if (!chatCurrentUser) {
    showToast("Please setup chat user first", "warning");
    return null;
  }

  const { alertId, tagMac, alertType, message } = alertData;

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    // Get all users to add to alert conversation
    // Ensure chatUsers is loaded; if empty, at least include current user
    let userIds = chatUsers.map(u => u.id);
    if (!userIds.includes(chatCurrentUser.id)) {
      userIds.push(chatCurrentUser.id);
    }

    // Warn if no other users to notify (only current user)
    if (userIds.length <= 1) {
      console.warn("createAlertConversation: No other chat users to notify. Consider loading users first.");
      showToast("Warning: No other users to notify about this alert", "warning");
    }

    const resp = await fetch("/api/chat/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "alert",
        name: `Alert: ${alertType} - ${tagMac}`,
        alert_id: alertId,
        tag_mac: tagMac,
        created_by: chatCurrentUser.id,
        participant_ids: userIds
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create alert conversation");
    }

    const conv = await resp.json();

    // Send alert message
    await fetch("/api/chat/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_id: conv.id,
        sender_id: chatCurrentUser.id,
        content: message || `Alert triggered: ${alertType}`,
        message_type: "alert",
        metadata: { alertId, tagMac, alertType }
      })
    });

    showToast("Alert conversation created", "success");
    addEvent("chat", `Alert conversation created for ${tagMac}`);

    await loadChatConversations();
    return conv.id;
  } catch (e) {
    showToast("Error creating alert chat: " + e.message, "error");
    return null;
  }
}

// Share tag location via chat
async function shareTagLocationInChat(tagData) {
  if (!chatCurrentConversation || !chatCurrentUser) {
    showToast("Open a conversation first", "warning");
    return;
  }

  const { mac, lat, lng, name } = tagData;

  try {
    const adminToken = localStorage.getItem("utfind_admin_token") || "";
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
    else if (apiKey) headers["X-API-Key"] = apiKey;

    await fetch("/api/chat/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_id: chatCurrentConversation.id,
        sender_id: chatCurrentUser.id,
        content: `Shared location: ${name || mac}`,
        message_type: "location",
        metadata: { mac, lat, lng, name }
      })
    });

    showToast("Location shared", "success");
    await loadChatMessages(chatCurrentConversation.id);
  } catch (e) {
    showToast("Error sharing location: " + e.message, "error");
  }
}

function focusMapLocation(lat, lng) {
  if (lat && lng) {
    map.setView([lat, lng], 16);
    showToast(`Focused on location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, "info");
  }
}

// ================================================================
//  [L10] Chat Utilities
// ================================================================

function getInitials(name) {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatChatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openChatSettings() {
  // TODO: Implement chat settings modal
  showToast("Chat settings coming soon", "info");
}

// Cleanup function for chat polling interval
function cleanupChatPolling() {
  if (chatPollingIntervalId) {
    clearInterval(chatPollingIntervalId);
    chatPollingIntervalId = null;
  }
}

// Use visibilitychange API for online/offline status (sendBeacon cannot set custom headers)
document.addEventListener("visibilitychange", () => {
  if (!chatCurrentUser) return;

  if (document.visibilityState === "hidden") {
    // User is leaving or switching tabs - set to away
    updateChatUserStatus("away");
  } else if (document.visibilityState === "visible") {
    // User is back - set to online
    updateChatUserStatus("online");
  }
});

// Cleanup polling on page unload
window.addEventListener("beforeunload", () => {
  cleanupChatPolling();
  // Note: Cannot reliably set offline status here since sendBeacon cannot set auth headers
  // The visibilitychange handler sets "away" status which is sufficient
});

// Initialize chat when panel is shown
const originalSwitchPanel = typeof switchPanel === "function" ? switchPanel : null;
if (originalSwitchPanel) {
  window.switchPanel = function(panel) {
    // Cleanup chat polling when leaving chat panel
    if (panel !== "chat") {
      cleanupChatPolling();
    }

    originalSwitchPanel(panel);
    if (panel === "chat") {
      initChat();
    }
    if (panel === "schedules") {
      loadSchedules();
    }
  };
}

// ================================================================
//  [M] 報表排程系統 (Report Scheduling)
// ================================================================

let schedulesCache = [];
let schedulePollingTimer = null;

/**
 * Load all schedules from the API
 */
async function loadSchedules() {
  const listEl = document.getElementById("schedule-list");
  const execEl = document.getElementById("schedule-executions");

  if (!listEl) return;

  listEl.innerHTML = '<div class="empty-state">Loading schedules...</div>';

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/api/schedules", { headers });
    if (!res.ok) throw new Error("Failed to load schedules");

    const data = await res.json();
    schedulesCache = data.schedules || [];

    renderScheduleList();
    loadScheduleExecutions();
  } catch (err) {
    console.error("[Schedules] Load error:", err);
    listEl.innerHTML = '<div class="empty-state">Failed to load schedules</div>';
  }
}

/**
 * Render the schedule list
 */
function renderScheduleList() {
  const listEl = document.getElementById("schedule-list");
  if (!listEl) return;

  if (schedulesCache.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No schedules yet. Create your first schedule!</div>';
    return;
  }

  const reportTypeLabels = {
    temperature_excursion: "Temperature Excursion",
    geofence_events: "Geofence Events",
    task_completion: "Task Completion",
    haccp_compliance: "HACCP Compliance",
    batch_traceability: "Batch Traceability"
  };

  const freqLabels = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

  listEl.innerHTML = schedulesCache.map(s => {
    const statusColor = s.enabled ? (s.last_run_status === "success" ? "#10b981" : s.last_run_status === "failed" ? "#ef4444" : "#8b5cf6") : "#6b7280";
    const nextRun = s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "Not scheduled";
    const lastRun = s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "Never";

    return `
      <div class="schedule-item" data-id="${s.id}">
        <div class="schedule-header">
          <span class="schedule-status-dot" style="background:${statusColor};"></span>
          <span class="schedule-name">${escapeHtml(s.name)}</span>
          <span class="schedule-type-badge">${reportTypeLabels[s.report_type] || s.report_type}</span>
        </div>
        <div class="schedule-meta">
          <span class="freq-badge ${s.frequency}">${freqLabels[s.frequency] || s.frequency}</span>
          at ${String(s.run_at_hour).padStart(2, '0')}:${String(s.run_at_minute || 0).padStart(2, '0')}
          ${s.frequency === 'weekly' ? ` (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.day_of_week] || ''})` : ''}
          ${s.frequency === 'monthly' ? ` (Day ${s.day_of_month})` : ''}
        </div>
        <div class="schedule-times">
          <span>Next: ${nextRun}</span> &bull; <span>Last: ${lastRun}</span>
        </div>
        <div class="schedule-actions">
          <button class="btn-ghost btn-sm" onclick="editSchedule('${s.id}')" title="Edit">Edit</button>
          <button class="btn-ghost btn-sm" onclick="runScheduleNow('${s.id}')" title="Run Now">Run</button>
          <button class="btn-ghost btn-sm" onclick="toggleScheduleEnabled('${s.id}', ${!s.enabled})" title="${s.enabled ? 'Disable' : 'Enable'}">${s.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn-ghost btn-sm" onclick="deleteSchedule('${s.id}')" title="Delete" style="color:#ef4444;">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Load recent schedule executions
 */
async function loadScheduleExecutions() {
  const execEl = document.getElementById("schedule-executions");
  if (!execEl) return;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Get executions from the past 7 days
    const res = await fetch("/api/schedules?include_executions=1", { headers });
    if (!res.ok) return;

    const data = await res.json();
    const executions = data.executions || [];

    if (executions.length === 0) {
      execEl.innerHTML = '<div class="empty-state">No recent executions</div>';
      return;
    }

    execEl.innerHTML = executions.slice(0, 10).map(e => {
      const schedule = schedulesCache.find(s => s.id === e.schedule_id);
      const statusIcon = e.status === "success" ? "✓" : e.status === "failed" ? "✗" : "◌";
      const statusColor = e.status === "success" ? "#10b981" : e.status === "failed" ? "#ef4444" : "#f59e0b";

      return `
        <div class="execution-item">
          <span class="execution-status" style="color:${statusColor};">${statusIcon}</span>
          <span class="execution-name">${schedule ? escapeHtml(schedule.name) : 'Unknown'}</span>
          <span class="execution-time">${new Date(e.executed_at).toLocaleString()}</span>
          ${e.error_message ? `<span class="execution-error" title="${escapeHtml(e.error_message)}">!</span>` : ''}
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("[Schedules] Executions load error:", err);
  }
}

/**
 * Open the schedule modal for create/edit
 */
function openScheduleModal(scheduleId = null) {
  const modal = document.getElementById("schedule-modal");
  const title = document.getElementById("schedule-modal-title");
  const form = document.getElementById("schedule-form");

  if (!modal || !form) return;

  form.reset();
  document.getElementById("schedule-id").value = "";

  if (scheduleId) {
    // Edit mode
    const schedule = schedulesCache.find(s => s.id === scheduleId);
    if (!schedule) return;

    title.textContent = "Edit Schedule";
    document.getElementById("schedule-id").value = schedule.id;
    document.getElementById("schedule-name").value = schedule.name || "";
    document.getElementById("schedule-description").value = schedule.description || "";
    document.getElementById("schedule-type").value = schedule.report_type || "temperature_excursion";
    document.getElementById("schedule-frequency").value = schedule.frequency || "daily";
    document.getElementById("schedule-hour").value = schedule.run_at_hour || 6;
    document.getElementById("schedule-dow").value = schedule.day_of_week || 1;
    document.getElementById("schedule-dom").value = schedule.day_of_month || 1;
    document.getElementById("schedule-range").value = schedule.date_range_type || "last_24h";
    document.getElementById("schedule-recipients").value = (schedule.recipients || []).join(", ");

    updateScheduleFrequencyOptions();
  } else {
    title.textContent = "New Schedule";
    updateScheduleFrequencyOptions();
  }

  modal.classList.remove("hidden");
}

/**
 * Close the schedule modal
 */
function closeScheduleModal() {
  const modal = document.getElementById("schedule-modal");
  if (modal) modal.classList.add("hidden");
}

/**
 * Edit an existing schedule
 */
function editSchedule(scheduleId) {
  openScheduleModal(scheduleId);
}

/**
 * Update visibility of day-of-week and day-of-month based on frequency
 */
function updateScheduleFrequencyOptions() {
  const freq = document.getElementById("schedule-frequency").value;
  const dowGroup = document.getElementById("schedule-dow-group");
  const domGroup = document.getElementById("schedule-dom-group");

  if (dowGroup) dowGroup.classList.toggle("hidden", freq !== "weekly");
  if (domGroup) domGroup.classList.toggle("hidden", freq !== "monthly");
}

/**
 * Save schedule (create or update)
 */
async function saveSchedule(event) {
  event.preventDefault();

  const scheduleId = document.getElementById("schedule-id").value;
  const isEdit = !!scheduleId;

  const name = document.getElementById("schedule-name").value.trim();
  const description = document.getElementById("schedule-description").value.trim();
  const report_type = document.getElementById("schedule-type").value;
  const frequency = document.getElementById("schedule-frequency").value;
  const run_at_hour = parseInt(document.getElementById("schedule-hour").value);
  const day_of_week = parseInt(document.getElementById("schedule-dow").value);
  const day_of_month = parseInt(document.getElementById("schedule-dom").value);
  const date_range_type = document.getElementById("schedule-range").value;
  const recipientsRaw = document.getElementById("schedule-recipients").value;
  const recipients = recipientsRaw.split(",").map(e => e.trim()).filter(e => e);

  if (!name) {
    showToast("Schedule name is required", "error");
    return;
  }

  const payload = {
    name,
    description: description || null,
    report_type,
    frequency,
    run_at_hour,
    run_at_minute: 0,
    day_of_week: frequency === "weekly" ? day_of_week : null,
    day_of_month: frequency === "monthly" ? day_of_month : null,
    date_range_type,
    recipients,
    delivery_method: "email"
  };

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = isEdit ? `/api/schedules/${scheduleId}` : "/api/schedules";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to save schedule");
    }

    showToast(isEdit ? "Schedule updated!" : "Schedule created!", "success");
    closeScheduleModal();
    loadSchedules();
  } catch (err) {
    console.error("[Schedules] Save error:", err);
    showToast(err.message, "error");
  }
}

/**
 * Toggle schedule enabled/disabled
 */
async function toggleScheduleEnabled(scheduleId, enabled) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ enabled })
    });

    if (!res.ok) throw new Error("Failed to update schedule");

    showToast(enabled ? "Schedule enabled" : "Schedule disabled", "success");
    loadSchedules();
  } catch (err) {
    console.error("[Schedules] Toggle error:", err);
    showToast(err.message, "error");
  }
}

/**
 * Delete a schedule
 */
async function deleteSchedule(scheduleId) {
  if (!confirm("Are you sure you want to delete this schedule?")) return;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "DELETE",
      headers
    });

    if (!res.ok) throw new Error("Failed to delete schedule");

    showToast("Schedule deleted", "success");
    loadSchedules();
  } catch (err) {
    console.error("[Schedules] Delete error:", err);
    showToast(err.message, "error");
  }
}

/**
 * Manually run a schedule now
 */
async function runScheduleNow(scheduleId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/schedules/${scheduleId}/run`, {
      method: "POST",
      headers
    });

    if (!res.ok) throw new Error("Failed to trigger schedule");

    showToast("Report generation started! You will receive an email when ready.", "success");
  } catch (err) {
    console.error("[Schedules] Run error:", err);
    showToast(err.message, "error");
  }
}

/**
 * Preview report data without saving
 */
async function previewScheduleReport() {
  const report_type = document.getElementById("schedule-type").value;
  const date_range_type = document.getElementById("schedule-range").value;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/api/schedules/preview", {
      method: "POST",
      headers,
      body: JSON.stringify({ report_type, date_range_type })
    });

    if (!res.ok) throw new Error("Failed to generate preview");

    const data = await res.json();
    const preview = data.preview;

    // Display preview in an alert (could be improved with a modal)
    let msg = `Report Preview\n${"=".repeat(40)}\n`;
    msg += `Period: ${preview.period?.start || "N/A"} to ${preview.period?.end || "N/A"}\n\n`;

    if (preview.summary) {
      msg += "Summary:\n";
      for (const [key, val] of Object.entries(preview.summary)) {
        msg += `  ${key}: ${val}\n`;
      }
    }

    if (preview.sample_data && preview.sample_data.length > 0) {
      msg += `\nSample Data (${preview.sample_data.length} items):\n`;
      msg += JSON.stringify(preview.sample_data[0], null, 2).slice(0, 500);
    }

    alert(msg);
  } catch (err) {
    console.error("[Schedules] Preview error:", err);
    showToast(err.message, "error");
  }
}

/**
 * Initialize schedule polling (refresh list periodically)
 */
function initSchedulePolling() {
  // Refresh schedules every 60 seconds when panel is visible
  schedulePollingTimer = setInterval(() => {
    const panel = document.getElementById("panel-schedules");
    if (panel && !panel.classList.contains("hidden")) {
      loadSchedules();
    }
  }, 60000);
}

// Start schedule polling on page load
document.addEventListener("DOMContentLoaded", initSchedulePolling);

// ================================================================
//  [M] Multi-tenant Admin Panel
//  Phase 3: Multi-tenant Management Interface
// ================================================================

let adminPanelState = {
  currentView: "clients",       // clients | users | analytics | audit
  selectedClient: null,
  clientTab: "overview",        // overview | users | devices | keys | usage
  clients: [],
  clientUsers: [],
  clientDevices: [],
  clientKeys: [],
  usageData: null,
  analyticsData: null,
  auditLogs: []
};

// ----------------------------------------------------------------
//  [M1] Admin Panel Initialization
// ----------------------------------------------------------------
function initAdminPanel() {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  // Check if user is super admin
  const token = localStorage.getItem("utfind_admin_token");
  if (!token) {
    panel.innerHTML = '<div class="admin-login-required">Please log in as admin to access this panel.</div>';
    return;
  }

  renderAdminPanel();
  loadClients();
}

// ----------------------------------------------------------------
//  [M2] Main Admin Panel Renderer
// ----------------------------------------------------------------
function renderAdminPanel() {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  panel.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <h3>Admin Panel</h3>
        </div>
        <nav class="sidebar-nav">
          <button class="sidebar-item ${adminPanelState.currentView === 'clients' ? 'active' : ''}"
                  onclick="switchAdminView('clients')">
            <span class="icon">&#x1F3E2;</span> Clients
          </button>
          <button class="sidebar-item ${adminPanelState.currentView === 'analytics' ? 'active' : ''}"
                  onclick="switchAdminView('analytics')">
            <span class="icon">&#x1F4CA;</span> Analytics
          </button>
          <button class="sidebar-item ${adminPanelState.currentView === 'audit' ? 'active' : ''}"
                  onclick="switchAdminView('audit')">
            <span class="icon">&#x1F4CB;</span> Audit Logs
          </button>
        </nav>
      </aside>
      <main class="admin-main">
        ${renderAdminContent()}
      </main>
    </div>
  `;
}

function renderAdminContent() {
  switch (adminPanelState.currentView) {
    case "clients":
      return adminPanelState.selectedClient
        ? renderClientDetail()
        : renderClientList();
    case "analytics":
      return renderPlatformAnalytics();
    case "audit":
      return renderAuditLogs();
    default:
      return renderClientList();
  }
}

function switchAdminView(view) {
  adminPanelState.currentView = view;
  adminPanelState.selectedClient = null;
  renderAdminPanel();

  // Load data for view
  switch (view) {
    case "clients": loadClients(); break;
    case "analytics": loadPlatformAnalytics(); break;
    case "audit": loadAuditLogs(); break;
  }
}

// ----------------------------------------------------------------
//  [M3] Client List
// ----------------------------------------------------------------
async function loadClients() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/clients", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || "Failed to load clients");

    adminPanelState.clients = data.clients || data;
    renderAdminPanel();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderClientList() {
  const clients = adminPanelState.clients;

  return `
    <div class="admin-header">
      <h2>Clients</h2>
      <div class="header-actions">
        <input type="text" id="client-search" placeholder="Search clients..."
               oninput="filterClients(this.value)" class="search-input">
        <select id="client-tier-filter" onchange="filterClientsByTier(this.value)">
          <option value="">All Tiers</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button class="btn-primary" onclick="showCreateClientModal()">
          + Create Client
        </button>
      </div>
    </div>

    <div class="admin-table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Users</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(c => `
            <tr onclick="selectClient('${c.id}')" class="clickable-row">
              <td>
                <strong>${escapeHtmlAdmin(c.name)}</strong>
                <div class="text-muted">${escapeHtmlAdmin(c.email)}</div>
              </td>
              <td>${escapeHtmlAdmin(c.company || "-")}</td>
              <td><span class="badge tier-${c.tier}">${c.tier}</span></td>
              <td><span class="badge status-${c.status}">${c.status}</span></td>
              <td>${c.client_tags?.[0]?.count || 0} / ${c.max_tags || "N/A"}</td>
              <td>${c.tenant_users?.[0]?.count || 0}</td>
              <td>${formatDateAdmin(c.created_at)}</td>
              <td>
                <button class="btn-icon" onclick="event.stopPropagation(); editClient('${c.id}')" title="Edit">
                  &#x270F;&#xFE0F;
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); toggleClientStatus('${c.id}', '${c.status}')"
                        title="${c.status === 'active' ? 'Suspend' : 'Activate'}">
                  ${c.status === "active" ? "&#x23F8;&#xFE0F;" : "&#x25B6;&#xFE0F;"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${clients.length === 0 ? '<div class="empty-state">No clients found</div>' : ''}
  `;
}

function filterClients(searchTerm) {
  // Re-render with filtered clients
  const term = searchTerm.toLowerCase();
  const filtered = adminPanelState.clients.filter(c =>
    c.name.toLowerCase().includes(term) ||
    c.email.toLowerCase().includes(term) ||
    (c.company && c.company.toLowerCase().includes(term))
  );
  // Update display only
  const tbody = document.querySelector(".admin-table tbody");
  if (tbody) {
    tbody.innerHTML = filtered.map(c => `
      <tr onclick="selectClient('${c.id}')" class="clickable-row">
        <td>
          <strong>${escapeHtmlAdmin(c.name)}</strong>
          <div class="text-muted">${escapeHtmlAdmin(c.email)}</div>
        </td>
        <td>${escapeHtmlAdmin(c.company || "-")}</td>
        <td><span class="badge tier-${c.tier}">${c.tier}</span></td>
        <td><span class="badge status-${c.status}">${c.status}</span></td>
        <td>${c.client_tags?.[0]?.count || 0} / ${c.max_tags || "N/A"}</td>
        <td>${c.tenant_users?.[0]?.count || 0}</td>
        <td>${formatDateAdmin(c.created_at)}</td>
        <td>
          <button class="btn-icon" onclick="event.stopPropagation(); editClient('${c.id}')" title="Edit">&#x270F;&#xFE0F;</button>
          <button class="btn-icon" onclick="event.stopPropagation(); toggleClientStatus('${c.id}', '${c.status}')"
                  title="${c.status === 'active' ? 'Suspend' : 'Activate'}">
            ${c.status === "active" ? "&#x23F8;&#xFE0F;" : "&#x25B6;&#xFE0F;"}
          </button>
        </td>
      </tr>
    `).join("");
  }
}

// ----------------------------------------------------------------
//  [M4] Client Detail View
// ----------------------------------------------------------------
async function selectClient(clientId) {
  adminPanelState.selectedClient = adminPanelState.clients.find(c => c.id === clientId);
  adminPanelState.clientTab = "overview";
  renderAdminPanel();

  // Load client data
  await Promise.all([
    loadClientUsers(clientId),
    loadClientDevices(clientId),
    loadClientKeys(clientId),
    loadClientUsage(clientId)
  ]);
}

function renderClientDetail() {
  const client = adminPanelState.selectedClient;
  if (!client) return renderClientList();

  return `
    <div class="admin-header">
      <button class="btn-back" onclick="backToClientList()">&#x2190; Back to Clients</button>
      <div class="client-header-info">
        <h2>${escapeHtmlAdmin(client.name)}</h2>
        <span class="badge status-${client.status}">${client.status}</span>
        <span class="badge tier-${client.tier}">${client.tier}</span>
      </div>
      <button class="btn-secondary" onclick="editClient('${client.id}')">Edit Client</button>
    </div>

    <div class="client-tabs">
      <button class="tab-btn ${adminPanelState.clientTab === 'overview' ? 'active' : ''}"
              onclick="switchClientTab('overview')">Overview</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'users' ? 'active' : ''}"
              onclick="switchClientTab('users')">Users</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'devices' ? 'active' : ''}"
              onclick="switchClientTab('devices')">Devices</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'keys' ? 'active' : ''}"
              onclick="switchClientTab('keys')">API Keys</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'usage' ? 'active' : ''}"
              onclick="switchClientTab('usage')">Usage</button>
    </div>

    <div class="client-tab-content">
      ${renderClientTabContent()}
    </div>
  `;
}

function renderClientTabContent() {
  switch (adminPanelState.clientTab) {
    case "overview": return renderClientOverview();
    case "users": return renderUserTab();
    case "devices": return renderDeviceTab();
    case "keys": return renderKeyTab();
    case "usage": return renderUsageChart();
    default: return renderClientOverview();
  }
}

function renderClientOverview() {
  const client = adminPanelState.selectedClient;
  const users = adminPanelState.clientUsers;
  const devices = adminPanelState.clientDevices;
  const keys = adminPanelState.clientKeys;

  return `
    <div class="overview-grid">
      <div class="stat-card">
        <div class="stat-icon">&#x1F465;</div>
        <div class="stat-content">
          <div class="stat-value">${users.length}</div>
          <div class="stat-label">Users</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">&#x1F4E1;</div>
        <div class="stat-content">
          <div class="stat-value">${devices.length} / ${client.max_tags || 'N/A'}</div>
          <div class="stat-label">Devices</div>
          ${client.max_tags ? `<div class="stat-bar"><div class="stat-bar-fill" style="width: ${Math.min(100, devices.length / client.max_tags * 100)}%"></div></div>` : ''}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">&#x1F511;</div>
        <div class="stat-content">
          <div class="stat-value">${keys.filter(k => k.status === 'active').length} / ${client.max_keys || 'N/A'}</div>
          <div class="stat-label">API Keys</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">&#x1F4CA;</div>
        <div class="stat-content">
          <div class="stat-value">${adminPanelState.usageData?.summary?.api_calls_period || 0}</div>
          <div class="stat-label">API Calls (30d)</div>
        </div>
      </div>
    </div>

    <div class="client-info-section">
      <h3>Client Information</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>Email</label>
          <span>${escapeHtmlAdmin(client.email)}</span>
        </div>
        <div class="info-item">
          <label>Company</label>
          <span>${escapeHtmlAdmin(client.company || "-")}</span>
        </div>
        <div class="info-item">
          <label>Phone</label>
          <span>${escapeHtmlAdmin(client.phone || "-")}</span>
        </div>
        <div class="info-item">
          <label>Created</label>
          <span>${formatDateTimeAdmin(client.created_at)}</span>
        </div>
      </div>
      ${client.notes ? `<div class="info-notes"><label>Notes</label><p>${escapeHtmlAdmin(client.notes)}</p></div>` : ""}
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M5] User Tab
// ----------------------------------------------------------------
async function loadClientUsers(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/users`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientUsers = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "users") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

function renderUserTab() {
  const users = adminPanelState.clientUsers;

  return `
    <div class="tab-header">
      <h3>Users (${users.length})</h3>
      <button class="btn-primary" onclick="showInviteUserModal()">+ Invite User</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escapeHtmlAdmin(u.name)}</td>
            <td>${escapeHtmlAdmin(u.email)}</td>
            <td><span class="badge role-${u.role}">${u.role}</span></td>
            <td><span class="badge status-${u.status}">${u.status}</span></td>
            <td>${u.last_login_at ? formatDateTimeAdmin(u.last_login_at) : "Never"}</td>
            <td>
              <button class="btn-icon" onclick="editUserAdmin('${u.id}')" title="Edit">&#x270F;&#xFE0F;</button>
              <button class="btn-icon" onclick="removeUserAdmin('${u.id}')" title="Remove">&#x1F5D1;&#xFE0F;</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${users.length === 0 ? '<div class="empty-state">No users found</div>' : ''}
  `;
}

// ----------------------------------------------------------------
//  [M6] Device Tab
// ----------------------------------------------------------------
async function loadClientDevices(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/devices`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientDevices = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "devices") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load devices:", err);
  }
}

function renderDeviceTab() {
  const devices = adminPanelState.clientDevices;
  const client = adminPanelState.selectedClient;

  return `
    <div class="tab-header">
      <h3>Devices (${devices.length} / ${client.max_tags || 'N/A'})</h3>
      <button class="btn-primary" onclick="showBindDeviceModal()">+ Bind Device</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>MAC Address</th>
          <th>Label</th>
          <th>Status</th>
          <th>Last Seen</th>
          <th>Temperature</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${devices.map(d => `
          <tr>
            <td><code>${d.mac}</code></td>
            <td>${escapeHtmlAdmin(d.label || "-")}</td>
            <td><span class="badge status-${d.status || 'offline'}">${d.status || 'offline'}</span></td>
            <td>${d.latest_data?.created_at ? formatDateTimeAdmin(d.latest_data.created_at) : "Never"}</td>
            <td>${d.latest_data?.temperature ? d.latest_data.temperature + " C" : "-"}</td>
            <td>
              <button class="btn-icon" onclick="editDeviceAdmin('${d.id}')" title="Edit">&#x270F;&#xFE0F;</button>
              <button class="btn-icon" onclick="unbindDeviceAdmin('${d.id}')" title="Unbind">&#x1F513;</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${devices.length === 0 ? '<div class="empty-state">No devices bound</div>' : ''}
  `;
}

// ----------------------------------------------------------------
//  [M7] API Key Tab
// ----------------------------------------------------------------
async function loadClientKeys(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/keys`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientKeys = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "keys") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load keys:", err);
  }
}

function renderKeyTab() {
  const keys = adminPanelState.clientKeys;
  const client = adminPanelState.selectedClient;
  const activeKeys = keys.filter(k => k.status === "active");

  return `
    <div class="tab-header">
      <h3>API Keys (${activeKeys.length} / ${client.max_keys || 'N/A'})</h3>
      <button class="btn-primary" onclick="showCreateKeyModal()">+ Create Key</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Key</th>
          <th>Permissions</th>
          <th>Status</th>
          <th>Last Used</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${keys.map(k => `
          <tr>
            <td>${escapeHtmlAdmin(k.name)}</td>
            <td><code>${k.key.substring(0, 8)}...${k.key.slice(-4)}</code></td>
            <td>${(k.permissions || []).join(", ")}</td>
            <td><span class="badge status-${k.status}">${k.status}</span></td>
            <td>${k.last_used_at ? formatDateTimeAdmin(k.last_used_at) : "Never"}</td>
            <td>
              ${k.status === "active" ? `
                <button class="btn-icon" onclick="revokeKeyAdmin('${k.id}')" title="Revoke">&#x1F512;</button>
              ` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${keys.length === 0 ? '<div class="empty-state">No API keys</div>' : ''}
  `;
}

// ----------------------------------------------------------------
//  [M8] Usage Chart
// ----------------------------------------------------------------
async function loadClientUsage(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/usage`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.usageData = await resp.json();
    if (adminPanelState.clientTab === "usage") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load usage:", err);
  }
}

function renderUsageChart() {
  const usage = adminPanelState.usageData;
  if (!usage) return '<div class="loading">Loading usage data...</div>';

  const daily = usage.daily_usage || [];
  const maxCalls = Math.max(...daily.map(d => d.request_count), 1);

  return `
    <div class="usage-summary">
      <div class="stat-card">
        <div class="stat-value">${usage.summary?.api_calls_period || 0}</div>
        <div class="stat-label">Total API Calls (30d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${usage.summary?.api_errors_period || 0}</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>

    <div class="usage-chart">
      <h3>Daily API Usage</h3>
      <div class="chart-container">
        ${daily.slice(-30).map(d => `
          <div class="chart-bar" style="height: ${(d.request_count / maxCalls * 100)}%"
               title="${d.date}: ${d.request_count} calls">
          </div>
        `).join("")}
      </div>
      <div class="chart-labels">
        ${daily.slice(-30).filter((_, i) => i % 7 === 0).map(d => `
          <span>${d.date.slice(5)}</span>
        `).join("")}
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M9] Platform Analytics (Super Admin)
// ----------------------------------------------------------------
async function loadPlatformAnalytics() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/analytics/overview", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.analyticsData = await resp.json();
    renderAdminPanel();
  } catch (err) {
    showToast("Failed to load analytics", "error");
  }
}

function renderPlatformAnalytics() {
  const data = adminPanelState.analyticsData;
  if (!data) return '<div class="loading">Loading analytics...</div>';

  return `
    <div class="admin-header">
      <h2>Platform Analytics</h2>
      <select onchange="changePeriod(this.value)">
        <option value="7d">Last 7 days</option>
        <option value="30d" selected>Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
    </div>

    <div class="overview-grid">
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_clients || 0}</div>
        <div class="stat-label">Total Clients</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.active_clients || 0}</div>
        <div class="stat-label">Active Clients</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_users || 0}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_devices || 0}</div>
        <div class="stat-label">Total Devices</div>
      </div>
    </div>

    <div class="analytics-section">
      <h3>Tier Distribution</h3>
      <div class="tier-chart">
        ${Object.entries(data.tier_distribution || {}).map(([tier, count]) => `
          <div class="tier-bar">
            <span class="tier-label">${tier}</span>
            <div class="tier-bar-container">
              <div class="tier-bar-fill tier-${tier}"
                   style="width: ${data.summary?.total_clients ? count / data.summary.total_clients * 100 : 0}%"></div>
            </div>
            <span class="tier-count">${count}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M10] Audit Logs
// ----------------------------------------------------------------
async function loadAuditLogs() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/analytics/audit-logs?limit=100", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.auditLogs = await resp.json();
    renderAdminPanel();
  } catch (err) {
    showToast("Failed to load audit logs", "error");
  }
}

function renderAuditLogs() {
  const logs = adminPanelState.auditLogs || [];

  return `
    <div class="admin-header">
      <h2>Audit Logs</h2>
      <div class="header-actions">
        <select id="audit-resource-filter" onchange="filterAuditLogs()">
          <option value="">All Resources</option>
          <option value="clients">Clients</option>
          <option value="tenant_users">Users</option>
          <option value="client_tags">Devices</option>
          <option value="api_keys">API Keys</option>
        </select>
        <select id="audit-action-filter" onchange="filterAuditLogs()">
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
        </select>
      </div>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(log => `
          <tr>
            <td>${formatDateTimeAdmin(log.created_at)}</td>
            <td>
              <span class="badge">${log.actor_type}</span>
              ${escapeHtmlAdmin(log.actor_email || log.actor_id?.slice(0, 8) || "System")}
            </td>
            <td><span class="badge action-${log.action}">${log.action}</span></td>
            <td>${log.resource}</td>
            <td>
              <button class="btn-icon" onclick="showAuditDetail('${log.id}')" title="View Details">
                &#x1F50D;
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${logs.length === 0 ? '<div class="empty-state">No audit logs found</div>' : ''}
  `;
}

// ----------------------------------------------------------------
//  [M11] Modal Helpers
// ----------------------------------------------------------------
function showCreateClientModal() {
  showAdminModal("Create Client", `
    <form id="create-client-form" onsubmit="createClient(event)">
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" required>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" required>
      </div>
      <div class="form-group">
        <label>Company</label>
        <input type="text" name="company">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" name="phone">
      </div>
      <div class="form-group">
        <label>Tier</label>
        <select name="tier">
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeAdminModal()">Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  `);
}

async function createClient(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/clients", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create client");
    }

    closeAdminModal();
    showToast("Client created successfully", "success");
    loadClients();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showInviteUserModal() {
  showAdminModal("Invite User", `
    <form id="invite-user-form" onsubmit="inviteUser(event)">
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" required>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" required>
      </div>
      <div class="form-group">
        <label>Role</label>
        <select name="role">
          <option value="user">User (View only)</option>
          <option value="operator">Operator (Manage devices)</option>
          <option value="admin">Admin (Full access)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Password (optional)</label>
        <input type="password" name="password" placeholder="Leave blank to send invite">
      </div>
      <p class="form-hint">If password is left blank, an invitation email will be sent.</p>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeAdminModal()">Cancel</button>
        <button type="submit" class="btn-primary">Create User</button>
      </div>
    </form>
  `);
}

async function inviteUser(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const clientId = adminPanelState.selectedClient?.id;

  if (!clientId) {
    showToast("No client selected", "error");
    return;
  }

  try {
    const token = localStorage.getItem("utfind_admin_token");
    // Note: Creating user via admin API would require a separate endpoint
    // For now, we use the tenant API pattern
    showToast("User invitation feature coming soon", "info");
    closeAdminModal();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showBindDeviceModal() {
  showAdminModal("Bind Device", `
    <form id="bind-device-form" onsubmit="bindDevice(event)">
      <div class="form-group">
        <label>MAC Address *</label>
        <input type="text" name="mac" placeholder="AA:BB:CC:DD:EE:FF" required
               pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}">
      </div>
      <div class="form-group">
        <label>Label</label>
        <input type="text" name="label" placeholder="e.g., Cold Truck 007">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeAdminModal()">Cancel</button>
        <button type="submit" class="btn-primary">Bind Device</button>
      </div>
    </form>
  `);
}

async function bindDevice(event) {
  event.preventDefault();
  showToast("Device binding feature coming soon", "info");
  closeAdminModal();
}

function showAdminModal(title, content) {
  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "admin-modal-overlay";
  overlay.className = "modal-overlay";
  overlay.onclick = (e) => { if (e.target === overlay) closeAdminModal(); };

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeAdminModal()">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function closeAdminModal() {
  const overlay = document.getElementById("admin-modal-overlay");
  if (overlay) overlay.remove();
}

async function editClient(clientId) {
  const client = adminPanelState.clients.find(c => c.id === clientId);
  if (!client) return;

  showAdminModal("Edit Client", `
    <form id="edit-client-form" onsubmit="saveClient(event, '${clientId}')">
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" value="${escapeHtmlAdmin(client.name)}" required>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" value="${escapeHtmlAdmin(client.email)}" required>
      </div>
      <div class="form-group">
        <label>Company</label>
        <input type="text" name="company" value="${escapeHtmlAdmin(client.company || '')}">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" name="phone" value="${escapeHtmlAdmin(client.phone || '')}">
      </div>
      <div class="form-group">
        <label>Tier</label>
        <select name="tier">
          <option value="free" ${client.tier === 'free' ? 'selected' : ''}>Free</option>
          <option value="basic" ${client.tier === 'basic' ? 'selected' : ''}>Basic</option>
          <option value="pro" ${client.tier === 'pro' ? 'selected' : ''}>Pro</option>
          <option value="enterprise" ${client.tier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="status">
          <option value="active" ${client.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="suspended" ${client.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes">${escapeHtmlAdmin(client.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeAdminModal()">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>
  `);
}

async function saveClient(event, clientId) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to update client");
    }

    closeAdminModal();
    showToast("Client updated successfully", "success");
    loadClients();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleClientStatus(clientId, currentStatus) {
  const newStatus = currentStatus === "active" ? "suspended" : "active";
  const action = newStatus === "suspended" ? "suspend" : "activate";

  if (!confirm(`Are you sure you want to ${action} this client?`)) return;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to update client status");
    }

    showToast(`Client ${action}d successfully`, "success");
    loadClients();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ----------------------------------------------------------------
//  [M12] Utility Functions for Admin Panel
// ----------------------------------------------------------------
function escapeHtmlAdmin(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatDateAdmin(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTimeAdmin(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

function backToClientList() {
  adminPanelState.selectedClient = null;
  renderAdminPanel();
}

function switchClientTab(tab) {
  adminPanelState.clientTab = tab;
  renderAdminPanel();
}

// Initialize admin panel when switching to admin view
function switchToAdminPanel() {
  switchPanel("admin");
  initAdminPanel();
}

// Export functions for global access
window.initAdminPanel = initAdminPanel;
window.switchAdminView = switchAdminView;
window.loadClients = loadClients;
window.selectClient = selectClient;
window.backToClientList = backToClientList;
window.switchClientTab = switchClientTab;
window.showCreateClientModal = showCreateClientModal;
window.createClient = createClient;
window.editClient = editClient;
window.saveClient = saveClient;
window.toggleClientStatus = toggleClientStatus;
window.showInviteUserModal = showInviteUserModal;
window.inviteUser = inviteUser;
window.showBindDeviceModal = showBindDeviceModal;
window.bindDevice = bindDevice;
window.closeAdminModal = closeAdminModal;
window.filterClients = filterClients;
window.loadPlatformAnalytics = loadPlatformAnalytics;
window.loadAuditLogs = loadAuditLogs;
