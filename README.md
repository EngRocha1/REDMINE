# REDMINE — Dashboard + Gantt HEMOPI

Aplicação local (proxy CORS) para o Redmine do projeto HEMOPI.

## Gantt (atualizado 2026-10-16)

Arquivo **monolítico** `gantt.js` (~43 KB) no repositório — **sem stub**.

Recursos:
- Filtros de sprint ocultam colunas no calendário
- Kanban com todas as colunas do filtro de status visíveis (mesmo vazias)
- Ícones 👁 (descrição), status e 👤 (responsável) nas barras
- Nome do responsável na parte inferior da barra
- Modais com arrastar, redimensionar e fullscreen
- Select-all / limpar por grupo de filtros

## Rodar local (Git Bash)

```bash
cd /d/REDMINE
git pull origin main
npm install
npm run proxy
```

Abra: **http://localhost:8787/gantt.html**  
Hard refresh: **Ctrl+Shift+R**

> O proxy (`proxy-server.js` na porta 8787) é necessário por CORS. GitHub Pages sozinho não substitui o proxy para a API Redmine.

## Login

Cookies locais: URL do Redmine, API key, projeto. Nada de senha no repositório.
