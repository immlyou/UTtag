const jwt = require("jsonwebtoken");
const { supabase } = require("./supabase");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET 環境變數未設定，拒絕啟動。請在 .env 中設定至少 32 字元的隨機字串。");
}
const JWT_SECRET = process.env.JWT_SECRET;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// 從 request 解析 admin token
function getAdminFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// 從 request 解析 API Key
const LAST_USED_THROTTLE_MS = 60_000; // S4: avoid write amplification on hot keys

async function getClientFromApiKey(req) {
  const key = req.headers["x-api-key"];
  if (!key) return null;
  const { data } = await supabase
    .from("api_keys")
    .select("*, clients(*)")
    .eq("key", key)
    .eq("status", "active")
    .single();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  // Throttle: only update last_used_at if it's stale by > 60s.
  const lastUsedMs = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - lastUsedMs > LAST_USED_THROTTLE_MS) {
    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
  }
  return data;
}

// CORS headers
// S3 fix: fail-closed in production. If NODE_ENV=production and ALLOWED_ORIGINS is unset,
// we refuse to emit a wildcard and instead log a warning — unauthorized browsers will be blocked.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : null;
const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD && !ALLOWED_ORIGINS) {
  console.warn("[CORS] NODE_ENV=production but ALLOWED_ORIGINS not set — all cross-origin requests will be blocked.");
}

function cors(res, req) {
  const origin = req?.headers?.origin;
  if (ALLOWED_ORIGINS) {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    // else: do not emit ACAO — browser will block.
  } else if (!IS_PROD) {
    // Dev-only convenience: wildcard. Never in production.
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
}

// 統一回應
function json(res, data, status = 200, req) {
  cors(res, req);
  res.status(status).json(data);
}

function error(res, message, status = 400, req) {
  cors(res, req);
  res.status(status).json({ error: message });
}

module.exports = { signToken, verifyToken, getAdminFromReq, getClientFromApiKey, cors, json, error, JWT_SECRET };
