# REDMINE — Dashboard Executivo HEMOPI

Dashboard público para acompanhamento de sprints, backlog e status do projeto **HEMOPI 2.0** (e subprojetos) via **Redmine REST API**.

**Repositório:** https://github.com/EngRocha1/REDMINE  
**Demo (GitHub Pages):** após ativar Pages em Settings → Pages → branch `main` / pasta `/` (ou `/docs`).

---

## Segurança (importante)

- **Nenhuma chave de API é commitada** neste repositório.
- Credenciais ficam **apenas em cookies do navegador**, depois do aceite da política de cookies.
- Logout apaga os cookies.
- Use sempre HTTPS no Redmine e chave com permissões mínimas.

---

## Como usar

### Opção A — abrir localmente

```bash
git clone https://github.com/EngRocha1/REDMINE.git
cd REDMINE
# Servidor estático simples
npx --yes serve -p 8080
# abra http://localhost:8080
```

Se o navegador bloquear a API por **CORS**, use o proxy local:

```bash
npm install
npm run proxy
# abra http://localhost:8787
```

### Opção B — GitHub Pages

1. Settings → Pages → Source: Deploy from branch → `main` → `/ (root)`  
2. Acesse `https://EngRocha1.github.io/REDMINE/`  
3. Se CORS bloquear, use o proxy local ou peça ao admin do Redmine para liberar o domínio nas origens permitidas.

### Login

1. Aceite a política de cookies.  
2. Informe **e-mail válido** + **URL do Redmine** (ex.: `https://projetos.ati.pi.gov.br`) + **API key**.  
3. A chave fica só no cookie (não no código).

---

## Recursos

- KPIs (Total, Nova, Em Validação, Planejamento, Resolvida, Backlog)
- Cards por Sprint (seg–sex) + backlog
- Gráficos (Chart.js): status, módulos, sprint empilhado
- Matriz sprint × status
- Tabela filtrável (M01–M03, M04–09, LEG, INF, backlog, sprints)
- Botão **refresh** (circular) e **logout** (limpa cookies)
- Glossário técnico (M01, [US], [TS], Sprint, Backlog, Scrum…)

---

## Variáveis de cookie

| Cookie | Conteúdo |
|--------|----------|
| `rd_email` | E-mail informado |
| `rd_url` | Base URL do Redmine |
| `rd_key` | API key |
| `rd_cookie_ok` | Aceite da política |

---

## Licença

MIT © EngRocha1
