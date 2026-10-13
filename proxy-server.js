/**
 * Proxy local para contornar CORS ao chamar a API Redmine.
 * Não armazena a API key — apenas repassa o header X-Redmine-API-Key do browser.
 *
 * Uso: npm install && npm run proxy
 * Abra http://localhost:8787
 */
const express = require("express");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = process.env.PORT || 8787;
const app = express();

app.use(express.static(path.join(__dirname)));

// Proxy: /api/* → REDMINE_TARGET/*  (target vem do header X-Redmine-Target)
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
        proxyReq.removeHeader("x-redmine-target");
      },
    },
  })
);

app.listen(PORT, () => {
  console.log(`Dashboard + proxy em http://localhost:${PORT}`);
  console.log("A API key NÃO é salva no servidor — só repassada por request.");
});
