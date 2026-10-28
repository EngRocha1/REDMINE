# Atualizar Gantt (criação na semana da sprint)

## Regra
- Qualquer **projeto marcado** entra no Gantt/Dashboard.
- **Sprint** = `fixed_version` **ou** data de criação/start dentro do período da sprint.
- **Kanban da sprint** lista tudo daquela semana (versionado ou não).

## No PC (Git Bash)
```bash
cd /d/REDMINE
git fetch origin
git show origin/main:gantt-runtime-fix.js > gantt-runtime-fix.js
git show origin/main:assemble-gantt.js > assemble-gantt.js
# baixar partes do gantt (quando publicadas):
# for i in $(seq -w 0 41); do git show origin/main:gantt.js.s$i.b64 > gantt.js.s$i.b64; done
# node assemble-gantt.js

# Wire HTML (sem Python):
grep -q gantt-runtime-fix.js gantt.html || sed -i 's|<script src="gantt.js"></script>|<script src="gantt.js"></script>\n<script src="gantt-runtime-fix.js"></script>|' gantt.html

# Limpar filtros no browser (F12 console):
# localStorage.removeItem('hemopi_shared_filters'); location.reload();
```
