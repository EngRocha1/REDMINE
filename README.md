# REDMINE — Dashboard + Gantt HEMOPI

Dashboard executivo e Gantt interativo para Redmine (HEMOPI 2.0).

- **Repo:** https://github.com/EngRocha1/REDMINE
- **Pages:** https://engrocha1.github.io/REDMINE/ (só UI; API precisa de proxy local)

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

Login: e-mail + URL Redmine + API Key + ID projeto (ex. `414`). Credenciais **só em cookies**.

## Se o Gantt ficar em branco

O `gantt.js` no `main` pode estar desatualizado. Restaure a última versão estável:

```bash
cd REDMINE
curl -sL "https://raw.githubusercontent.com/EngRocha1/REDMINE/ed365ee418e6ced65c319d0c0987ac4e7f508973/gantt.js" -o gantt.js
npm run proxy
```

Depois abra http://localhost:8787/gantt.html e use **Ctrl+Shift+R**.

## Arquitetura (sem gambiarra de DOM)

```
index.html + app.js + styles.css     → Dashboard
gantt.html + gantt.js + gantt.css    → Gantt + Kanban
proxy-server.js                      → CORS proxy :8787
```

- Código-fonte versionado apenas nos arquivos acima.
- Sem `eval`, sem `atob` de payload externo, sem injeção de script fora do `gantt.js`.
- Proxy repassa `X-Redmine-API-Key` e `X-Redmine-Target` (não grava a key).

## Gantt (versão estável)

- Arrastar barra → datas + sprint no Redmine
- Backlog remove versão
- Menu ⋮ → status
- 👁 → Kanban da sprint
- Filtros colapsáveis (Escopo, Sprint, Módulo, Status, Menu ⋮)

## Segurança

Sem API key no Git. Cookies `SameSite=Strict`. Logout apaga cookies.

MIT © EngRocha1
