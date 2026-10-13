# REDMINE — Dashboard + Gantt HEMOPI

- **Repo:** https://github.com/EngRocha1/REDMINE
- **Pages:** https://engrocha1.github.io/REDMINE/
- **Local (recomendado para API):** `npm run proxy` → http://localhost:8787

## Uso local

```bash
git clone https://github.com/EngRocha1/REDMINE.git
cd REDMINE
npm install
npm run proxy
```

| Tela | URL |
|------|-----|
| Dashboard | http://localhost:8787/ |
| Gantt | http://localhost:8787/gantt.html |

Login: e-mail + URL Redmine + API Key + ID projeto (`414`). Credenciais só em cookies.

## Se o Gantt ficar em branco

```bash
cd REDMINE
curl -sL "https://raw.githubusercontent.com/EngRocha1/REDMINE/ed365ee418e6ced65c319d0c0987ac4e7f508973/gantt.js" -o gantt.js
head -n 3 gantt.js   # deve ser o IIFE completo, não placeholder
npm run proxy
```

Hard refresh: Ctrl+Shift+R.

**Importante:** GitHub Pages é só UI estática. A API do Redmine no browser exige o proxy local (`:8787`) por CORS. Falha de deploy do Pages **não** afeta o localhost.

## CI / Pages

Workflow em dois jobs (`build` sobe artefato `_site`, `deploy` publica). Source: Settings → Pages → GitHub Actions.

## Arquitetura

```
index.html + app.js + styles.css
gantt.html + gantt.js + gantt.css
proxy-server.js
```

Sem eval/atob de payload externo. API key só em cookie + header por request.

MIT © EngRocha1
