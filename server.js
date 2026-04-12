require("dotenv").config({ path: ".env.local" });

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = 3030;

// 只允許存取前端需要的靜態檔案，避免暴露敏感檔案
const ALLOWED_STATIC = [
  "index.html", "admin.html", "tenant-login.html", "tenant.html", "admin-impersonate.html", "app.js", "style.css",
  "sw.js", "manifest.json",
  "password-forgot.html", "password-reset.html", "invite-accept.html",
];
// Directory prefixes that are safe to expose (served read-only by express.static).
const ALLOWED_STATIC_DIRS = ["js/"];

app.use((req, res, next) => {
  // 允許根路徑
  if (req.path === "/") return next();
  // 允許 /api 路徑（由 proxy 處理）
  if (req.path.startsWith("/api")) return next();

  const file = req.path.replace(/^\//, "");
  if (ALLOWED_STATIC.includes(file)) return next();
  if (ALLOWED_STATIC_DIRS.some(dir => file.startsWith(dir))) return next();

  // 阻擋其他靜態檔案存取
  res.status(404).send("Not found");
});

app.use(express.static(path.join(__dirname)));

// Parse JSON for local API routes
app.use(express.json());

// Local routing for /api/* BEFORE the proxy middleware
// These are handled by local handlers, not proxied to external API

// Chat routes
app.use("/api/chat/users", require("./api/chat/users"));
app.use("/api/chat/conversations", require("./api/chat/conversations"));
app.use("/api/chat/messages", require("./api/chat/messages"));
app.use("/api/chat/participants", require("./api/chat/participants"));

// Schedule routes
app.use("/api/schedules", require("./api/schedules"));

// ============================================
// Phase 3: Multi-tenant Admin Routes
// ============================================
// Admin routes (Super Admin only)
app.use("/api/admin/clients", require("./api/admin/clients"));
app.use("/api/admin/analytics", require("./api/admin/analytics"));
app.use("/api/admin/impersonate", require("./api/admin/impersonate"));

// Tenant routes (Tenant Users)
app.use("/api/tenant/auth", require("./api/tenant/auth"));
app.use("/api/tenant/password", require("./api/tenant/password-flow"));
app.use("/api/tenant/invite", require("./api/tenant/invite-flow"));
app.use("/api/tenant/users", require("./api/tenant/users"));
app.use("/api/tenant/devices", require("./api/tenant/devices"));
app.use("/api/tenant/keys", require("./api/tenant/keys"));
app.use("/api/tenant/usage", require("./api/tenant/usage"));
app.use("/api/tenant/alerts", require("./api/tenant/alerts"));
app.use("/api/tenant/settings", require("./api/tenant/settings"));

// ============================================
// Phase 4: Mobile App Routes
// ============================================
app.use("/api/mobile/register-device", require("./api/mobile/register-device"));
app.use("/api/mobile/location", require("./api/mobile/location"));
app.use("/api/mobile/sync", require("./api/mobile/sync"));
app.use("/api/mobile/notifications", require("./api/mobile/notifications"));

// 代理 /api 請求到 UTFind API，解決 CORS 問題
// Note: /api/chat/* routes are handled above, so they won't reach this proxy
app.use(
  "/api",
  createProxyMiddleware({
    target: "https://utfind.api.beta.uttec.com.tw/api",
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
  })
);

// Initialize scheduler for report scheduling
const { initScheduler } = require("./lib/scheduler");
// Initialize push notification service
const { initFirebase } = require("./lib/push");

app.listen(PORT, async () => {
  console.log(`UTFind 伺服器已啟動：http://localhost:${PORT}`);

  // Start the report scheduler (unless disabled)
  if (process.env.ENABLE_SCHEDULER !== "false") {
    try {
      await initScheduler();
    } catch (err) {
      console.error("[Scheduler] Failed to initialize:", err.message);
    }
  }

  // Initialize Firebase for push notifications (unless disabled)
  if (process.env.ENABLE_PUSH !== "false") {
    try {
      initFirebase();
    } catch (err) {
      console.error("[Push] Failed to initialize:", err.message);
    }
  }
});
