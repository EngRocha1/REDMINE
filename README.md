# REDMINE — Dashboard + Gantt HEMOPI

- **Repo:** https://github.com/EngRocha1/REDMINE
- **Pages:** https://engrocha1.github.io/REDMINE/ (UI estática — **sem API**)
- **Local (obrigatório para API):** `npm run proxy` → http://localhost:8787

## Uso local (recomendado)

```bash
git clone https://github.com/EngRocha1/REDMINE.git
cd REDMINE
git pull origin main
npm install
npm run proxy
```

| Tela | URL |
|------|-----|
| Dashboard | http://localhost:8787/ |
| Gantt | http://localhost:8787/gantt.html |

Login: e-mail + URL Redmine + API Key + ID projeto (`414`). Credenciais **só em cookies**.

Hard refresh após atualizar: **Ctrl+Shift+R**.

### Conferir se o Gantt está completo

```bash
wc -c gantt.js          # deve ser > 40000
head -n 2 gantt.js      # deve começar com: (function () {
```

Se ainda for stub (`wc -c` < 2000), faça `git pull` de novo ou baixe os arquivos do último commit.

## Por que o proxy local é necessário?

O **GitHub Pages só serve arquivos estáticos** (HTML/CSS/JS). Ele **não** pode:

- fazer proxy de requests para o seu Redmine
- contornar CORS do browser
- guardar API keys no servidor

Quando o browser em `engrocha1.github.io` tenta chamar a API do Redmine, o Redmine bloqueia por CORS. No localhost `:8787`, o `proxy-server.js` repassa as chamadas com o header `X-Redmine-API-Key` e resolve o CORS.

**Alternativas reais** (se quiser Pages “com API”):

1. **Proxy local** (atual) — mais simples e seguro (key só no seu PC)
2. **Cloudflare Worker / Vercel serverless** como proxy CORS (você hospeda o proxy; key ainda não deve ir no front)
3. **Habilitar CORS no próprio Redmine** (`Access-Control-Allow-Origin`) se você administra o servidor — aí Pages + fetch direto funcionam, mas a API key continua no browser (cookie)

Não existe “proxy interno do GitHub Pages”.

## Novidades Gantt (out/2026)

- 👁 na barra da task → modal com **descrição** completa
- Nome do **responsável** na barra + 👤 para trocar assignee
- Modais com **arrastar / redimensionar / fullscreen**
- ☑ / ☐ por grupo de filtro (selecionar tudo / limpar)
- Colunas de sprint somem ao desmarcar no filtro
- Kanban mostra exatamente os status marcados em “Menu — status visíveis” (mesmo vazios)

## Arquitetura

```
index.html + app.js + styles.css
gantt.html + gantt.js + gantt.css
proxy-server.js
```

Sem eval/atob de payload externo. API key só em cookie + header por request.

MIT © EngRocha1
