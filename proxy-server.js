/**
 * Proxy local CORS → Redmine (GET/PUT/POST).
 * npm install && npm run proxy → http://localhost:8787
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = process.env.PORT || 8787;
const app = express();

app.use(express.static(path.join(__dirname)));

// Body parser ANTES do proxy (necessário para PUT de issues)
app.use("/api", express.json({ limit: "2mb" }));

app.use(
  "/api",
  createProxyMiddleware({
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    selfHandleResponse: false,
    router: (req) => {
      const t = req.headers["x-redmine-target"];
      if (!t) throw new Error("Header X-Redmine-Target obrigatório");
      return String(t).replace(/\/$/, "");
    },
    on: {
      proxyReq: (proxyReq, req) => {
        const key = req.headers["x-redmine-api-key"];
        if (key) proxyReq.setHeader("X-Redmine-API-Key", key);
        proxyReq.removeHeader("x-redmine-target");
        if (req.body && (req.method === "PUT" || req.method === "POST" || req.method === "PATCH")) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
    },
  })
);

app.listen(PORT, () => {
  console.log("http://localhost:" + PORT + "  (Dashboard + Gantt + proxy)");
});
