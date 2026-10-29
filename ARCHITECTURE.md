# HEMOPI Redmine — Arquitetura e documentação por página

## Visão geral

| Página | Arquivo HTML | JS | CSS | Função |
|--------|--------------|----|----|--------|
| Dashboard executivo | `index.html` | `app.js` + Chart.js CDN | `styles.css` | KPIs, gráficos, matriz sprint×status, tabela de issues |
| Gantt + Kanban | `gantt.html` | `gantt.js` | `gantt.css` | Timeline, filtros, modal Kanban, nova task/sprint |
| Proxy CORS | — | `proxy-server.js` | — | Encaminha `/api/*` → Redmine com API key |

Credenciais **somente em cookies** do navegador (`rd_email`, `rd_url`, `rd_key`, `rd_project`). Nunca no Git.

---

## 1. Dashboard (`index.html` + `app.js`)

### Fluxo
1. Cookie banner → login (URL Redmine, API key, project id).
2. `loadData()` busca issues (`status_id=*`) e versions via proxy ou direto.
3. `renderDashboard(issues, versions)` monta KPIs, cards de sprint, matriz, tabela e charts.

### Status canônicos (`ALL_STATUSES`)
Nova · Planejamento · Em Andamento · Em Validação · Em Deploy · Em Pagamento · Resolvida · Fechada · Rejeitada

`statusKey()` normaliza nomes do Redmine (ex.: `Desenvolvimento: Em Validação` → `Em Validação`).

### Charts
- Plugin `valueLabelsPlugin`: valores nos segmentos e total no topo das barras empilhadas.
- Labels de sprint multilinha: nome + período (`PERIODS`).

### Filtros
Projetos e desenvolvedores compartilhados com o Gantt via `localStorage` (`hemopi_shared_filters`).

---

## 2. Gantt (`gantt.html` + `gantt.js`)

### Fonte única de verdade
**Todo comportamento de UI está em `gantt.js`.**  
`gantt-hotfix.js` é **stub deprecated** (não registra listeners).

### Módulos internos principais
| Função | Papel |
|--------|--------|
| `api(method, path, body)` | GET/PUT/POST via proxy (`X-Redmine-Target`) ou direto |
| `applyFilters()` / `renderBars()` | Timeline e filtros |
| `openKanban(versionId, name)` | Modal Kanban por sprint |
| `openNewTaskDialog(ctx)` | Nova issue herdando versão e datas da sprint |
| `placeMenu(menu, x, y)` | Menus status/responsável dentro da viewport |
| `enhanceModal` + delegação `.modal-fs` | Arraste, resize e fullscreen do modal |

### Botão **+** nas células de sprint
Renderizado em `renderHead` / bandas de versão. Clique chama `openNewTaskDialog({ versionId, versionName, backlog })` e preenche `start_date`/`due_date` a partir da version.

### Barras sem data na sprint
`shortOnSprint`: barra de 2 dias no início da sprint quando a issue não tem start/due.

---

## 3. Kanban DnD (lógica integral)

Mesma estratégia do restante do app (dataTransfer HTML5 + UI otimista + `api` PUT):

1. **dragstart** no card: grava `dataTransfer.setData("text/plain", id)` e `dragId` de fallback.
2. **dragover** na coluna: `preventDefault` + classe `drag-over`.
3. **drop**:
   - Lê id prioritariamente do `dataTransfer` (fallback `dragId`).
   - Resolve `status_id` via mapa da API + `FALLBACK` local.
   - **Optimistic UI**: move o DOM do card, atualiza classe/label, `refreshKanbanCounts`.
   - `await api("PUT", "/issues/{id}.json", { issue: { status_id } })`.
   - Atualiza `allIssues` em memória e chama `applyFilters()` (Gantt) **sem fechar o modal**.
   - Em erro: toast + `openKanban` (rollback visual).

### Por que o hotfix foi removido
O hotfix registrava listeners em **capture** com `stopImmediatePropagation`, interceptava o drop do `gantt.js` e usava `fetch` paralelo com headers/IDs inconsistentes (`Resolvida: 3` vs `4`). Isso gerava:
- card que só “atualizava” ao reabrir o modal;
- PUT que falhava silenciosamente;
- contadores dessincronizados.

---

## 4. Proxy (`proxy-server.js`)

- Static files na raiz.
- `POST/PUT/PATCH` em `/api/*` com body JSON.
- Header obrigatório: `X-Redmine-Target` (URL base do Redmine).
- Propaga `X-Redmine-API-Key`.

```bash
npm install && npm run proxy   # http://localhost:8787
```

---

## 5. Arquivos de produção (whitelist)

```
index.html          Dashboard shell
app.js              Dashboard logic + charts
styles.css          Dashboard styles
gantt.html          Gantt shell
gantt.js            Gantt + Kanban (fonte única)
gantt.css           Gantt / Kanban styles
gantt-hotfix.js     Stub deprecated (não carregar)
proxy-server.js     CORS proxy
package.json
README.md
ARCHITECTURE.md     Este documento
```

Qualquer `*.b64`, `APPLY_*.sh`, `gantt.FULL*`, `g0.js`… são lixo de deploy e **não** devem voltar ao repositório.

---

## 6. Checklist de regressão

- [ ] Login com cookies; Logout limpa cookies.
- [ ] Dashboard: KPIs somam o total; todos os status presentes.
- [ ] Gráfico de sprints: período sob o nome; valores nas barras.
- [ ] Gantt: filtros, barras, short bars em tasks sem data.
- [ ] Olhinho da sprint → Kanban; arrastar card muda coluna na hora e persiste no Redmine.
- [ ] **+** na célula da sprint abre nova task com versão e datas.
- [ ] Fullscreen do modal (⛶) e menus dentro da viewport.

## Sanitizacao (Fase 1 — 2026-10-29)

- Removidos artefatos de transporte (.b64, chunks, parts) e scripts de montagem/patch.
- Runtime canonico Gantt: gantt.html + gantt.js + gantt.css + styles.css.
- Dashboard: index.html + app.js. Proxy: proxy-server.js.
- gantt-runtime-fix.js / gantt-hotfix.js eliminados do load path.
