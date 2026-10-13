# REDMINE — Dashboard + Gantt HEMOPI

**Repo:** https://github.com/EngRocha1/REDMINE  
**Pages:** https://engrocha1.github.io/REDMINE/ (só UI; API precisa de proxy local por CORS)

## Uso local (recomendado)

```bash
cd /d/REDMINE
git pull origin main
npm install
npm run proxy
```

Abra:
- Dashboard: http://localhost:8787/
- **Gantt:** http://localhost:8787/gantt.html

Login: e-mail + URL Redmine + API key + ID projeto (ex. `414`). Credenciais só em cookies.

## Gantt interativo

- Coluna esquerda limpa: **#issue + nome**
- Cabeçalho do calendário: **nome da sprint** + dias (finais de semana destacados)
- Filtros multi-select: **Escopo** (2.0 / Legado / INF), **Sprints**, **Módulos**, **Status**
- **Pan** no calendário (arrastar área vazia)
- **Arrastar** barra → move datas no Redmine
- **Bordas** da barra → redimensiona período no Redmine
- **⋮** na barra → troca status no Redmine

## Segurança

Sem API key no Git. Cookies locais + Logout.

MIT © EngRocha1
