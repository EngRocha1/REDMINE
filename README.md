# REDMINE — Dashboard + Gantt HEMOPI

Dashboard executivo e Gantt/Kanban para Redmine (projeto HEMOPI 2.0).

**Repo:** https://github.com/EngRocha1/REDMINE  
**Docs:** [ARCHITECTURE.md](./ARCHITECTURE.md)

## Uso local

```bash
npm install
npm run proxy
```

| Tela | URL |
|------|-----|
| Dashboard | http://localhost:8787/ |
| Gantt | http://localhost:8787/gantt.html |

Login: e-mail + URL do Redmine + API Key + ID do projeto. Credenciais **só em cookies**.

## Arquivos de produção

- `index.html` + `app.js` + `styles.css` — dashboard
- `gantt.html` + `gantt.js` + `gantt.css` — Gantt e Kanban
- `proxy-server.js` — proxy CORS
- `gantt-hotfix.js` — **deprecated** (stub; não usar)

## Kanban DnD

Arrastar card entre colunas: atualização otimista no DOM + `PUT /issues/{id}.json` via `api()`.  
Lógica **somente** em `gantt.js` (sem listeners paralelos).

## Segurança

Nenhuma API key no código ou no repositório.
