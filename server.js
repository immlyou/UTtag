const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = 3030;

// 靜態檔案（index.html, app.js, style.css）
app.use(express.static(path.join(__dirname)));

// 代理 /api 請求到 UTFind API，解決 CORS 問題
app.use(
  "/api",
  createProxyMiddleware({
    target: "https://utfind.api.beta.uttec.com.tw/api",
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
  })
);

app.listen(PORT, () => {
  console.log(`UTFind 伺服器已啟動：http://localhost:${PORT}`);
});
