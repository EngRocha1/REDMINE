# DEV REDMINE LOCAL — Baseline + pedidos 16/10/2026

**Repo:** https://github.com/EngRocha1/REDMINE
**Local:** `D:\REDMINE`
**Proxy:** `npm run proxy` → http://localhost:8787
**Arquivos-chave Gantt:** `gantt.js` (~43KB), `gantt.css`, `gantt.html`

## Estado consolidado

- Dashboard + Gantt interativo, login por cookies, proxy CORS local
- Filtros: Escopo / Sprint / Módulo / Status / Menu status visíveis
- Barras coloridas por status; drag move versão+datas
- Colunas de sprint somem ao desmarcar no filtro
- Kanban = status marcados no menu (mesmo vazios)

## Pedidos aplicados (16/10/2026)

1. Olhinho 👁 em toda barra → modal descrição (GET /issues/:id.json) com drag/resize/fullscreen
2. Nome do responsável na barra + 👤 para assignee
3. Modal Kanban com mesmo padrão universal de janela
4. ☑ / ☐ por grupo de filtro

## Atualizar local

```bash
cd /d/REDMINE
git pull origin main
wc -c gantt.js   # > 40000
npm run proxy
# Ctrl+Shift+R em http://localhost:8787/gantt.html
```

MIT · EngRocha1
