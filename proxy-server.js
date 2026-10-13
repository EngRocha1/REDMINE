/**
 * Proxy local CORS → Redmine REST (GET/PUT/POST).
 * Não grava API key — só repassa headers do browser.
 * npm install && npm run proxy → http://localhost:8787
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = process.env.PORT || 8787;
const app = express();

app.use(express.static(path.join(__dirname)));

app.use(
  "/api",
  createProxyMiddleware({
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    router: (req) => {
      const t = req.headers["x-redmine-target"];
      if (!t) throw new Error("Header X-Redmine-Target obrigatório");
      return String(t).replace(/\/$/, "");
    },
    on: {
      proxyReq: (proxyReq, req) => {
        const key = req.headers["x-redmine-api-key"];
        if (key) proxyReq.setHeader("X-Redmine-API-Key", key);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.removeHeader("x-redmine-target");
        // reencaminha body em PUT/POST
        if (req.body && Object.keys(req.body).length) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
    },
  })
);

// parse JSON before proxy for PUT body (middleware order: json only for non-proxy is tricky)
// Use raw body approach via express.json on /api with verify
app.use(express.json({ limit: "2mb" }));

app.listen(PORT, () => {
  console.log(`Dashboard + Gantt + proxy em http://localhost:${PORT}`);
});
