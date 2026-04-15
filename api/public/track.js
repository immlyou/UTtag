// Vercel serverless function: /api/public/track?id=<short>
// 公開棧板追蹤頁 API（無需登入）
// id 編碼：base64url(mac)。前端 share 時把 MAC 轉成 base64url 即可。
// 回傳：{mac, label, meta?, latest?, progress?}

const ANTHROPIC_NONE = null; // unused, placeholder

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=15"); // 15s 邊緣快取
}

function b64urlDecode(s) {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b + "===".slice((b.length + 3) % 4);
    return Buffer.from(pad, "base64").toString("utf8");
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const id = String(req.query?.id || "");
  if (!id) return res.status(400).json({ error: "id required" });
  const mac = b64urlDecode(id);
  if (!mac || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const macUpper = mac.toUpperCase();

  const UTTEC_KEY = process.env.UTTEC_API_KEY;
  if (!UTTEC_KEY) return res.status(500).json({ error: "UTTEC_API_KEY not configured" });

  try {
    const r = await fetch("https://api.utfind.uttec.com.tw/api/v1/tags/latest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: UTTEC_KEY, macs: [macUpper] }),
    });
    const data = await r.json();
    const latest = Array.isArray(data?.result) ? data.result[0] : null;
    if (!latest) {
      return res.status(404).json({ error: "Tag not found or not accessible", mac: macUpper });
    }
    return res.status(200).json({
      mac: macUpper,
      label: null,      // 前端可自行顯示 URL 上傳入的 label/meta
      latest: {
        lat: latest.lastLatitude,
        lng: latest.lastLongitude,
        battery: latest.lastBatteryLevel,
        status: latest.status,
        updatedAt: latest.lastRequestDate,
      },
    });
  } catch (e) {
    return res.status(502).json({ error: "Upstream error: " + e.message });
  }
};
