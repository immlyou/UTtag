const jwt = require("jsonwebtoken");
const { supabase } = require("./supabase");

const JWT_SECRET = process.env.JWT_SECRET || "utfind-default-secret-change-me";

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
  // 更新 last_used_at
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

// CORS headers
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
}

// 統一回應
function json(res, data, status = 200) {
  cors(res);
  res.status(status).json(data);
}

function error(res, message, status = 400) {
  cors(res);
  res.status(status).json({ error: message });
}

module.exports = { signToken, verifyToken, getAdminFromReq, getClientFromApiKey, cors, json, error, JWT_SECRET };
