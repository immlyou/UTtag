// Vercel serverless function: /api/ai/chat
// LLM 自然語言問答（Claude）— B2B 客戶端用
// 認證：tenant JWT (Bearer token, 同 JWT_SECRET)
// 輸入：{ messages: [{role, content}, ...], context?: {alerts?, usage?, tags?} }
// 輸出：{ reply: string, model: string, usage?: {...} }

const jwt = require("jsonwebtoken");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AI_MODEL || "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function err(res, code, message) {
  res.status(code).json({ error: message });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return err(res, 405, "Method not allowed");

  // 認證
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return err(res, 401, "Missing bearer token");
  if (!process.env.JWT_SECRET) return err(res, 500, "Server JWT_SECRET not configured");
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return err(res, 401, "Invalid token");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return err(res, 500, "Server ANTHROPIC_API_KEY not configured");
  }

  // 解析 body
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return err(res, 400, "Invalid JSON"); }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) return err(res, 400, "messages[] required");

  // 過濾並標準化 messages（只保留 user/assistant）
  const cleanMsgs = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-20); // 最多保留最近 20 則

  if (cleanMsgs.length === 0) return err(res, 400, "no valid messages");
  if (cleanMsgs[cleanMsgs.length - 1].role !== "user") return err(res, 400, "last message must be user");

  // 組 system prompt
  const ctx = body?.context || {};
  const sysParts = [
    "你是 UTtag 物聯網平台的 AI 助理，協助 B2B 客戶（冷鏈、物流、生醫公司）查詢自家裝置與告警資料。",
    "回答原則：",
    "1. 用繁體中文",
    "2. 若數字、時間、裝置 MAC 來自 context，要明確標出",
    "3. 不知道就說不知道；不要編造 MAC 或數字",
    "4. 簡潔，條列優先；不要套話開頭",
    "",
    `使用者：${user.email || user.name || "tenant user"}（client_id: ${user.client_id || "?"}）`,
  ];

  if (ctx.alerts && Array.isArray(ctx.alerts) && ctx.alerts.length > 0) {
    sysParts.push("\n[最近告警 (最多 30 筆)]");
    sysParts.push(JSON.stringify(ctx.alerts.slice(0, 30), null, 0));
  }
  if (ctx.usage && Array.isArray(ctx.usage) && ctx.usage.length > 0) {
    sysParts.push("\n[每日 API 用量 (最多 30 天)]");
    sysParts.push(JSON.stringify(ctx.usage.slice(-30), null, 0));
  }
  if (ctx.tags && Array.isArray(ctx.tags) && ctx.tags.length > 0) {
    sysParts.push(`\n[綁定裝置 (${ctx.tags.length} 個，僅顯示前 50)]`);
    sysParts.push(JSON.stringify(ctx.tags.slice(0, 50), null, 0));
  }
  if (ctx.summary && typeof ctx.summary === "object") {
    sysParts.push("\n[本期摘要]");
    sysParts.push(JSON.stringify(ctx.summary, null, 0));
  }

  const systemPrompt = sysParts.join("\n");

  // 呼叫 Claude
  try {
    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: cleanMsgs,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({
        error: "Anthropic API error",
        status: upstream.status,
        detail: text.slice(0, 500),
      });
    }

    const data = await upstream.json();
    const reply = data?.content?.find(c => c.type === "text")?.text || "";

    return res.status(200).json({
      reply,
      model: data?.model || MODEL,
      usage: data?.usage || null,
    });
  } catch (e) {
    return err(res, 500, "Upstream error: " + e.message);
  }
};
