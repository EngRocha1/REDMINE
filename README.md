# REDMINE — Dashboard Executivo HEMOPI

Dashboard público para sprints, backlog e status do **HEMOPI 2.0** via Redmine REST API.

**Código:** https://github.com/EngRocha1/REDMINE  
**Site (GitHub Pages):** https://engrocha1.github.io/REDMINE/

> Se o link ainda não abrir, ative uma vez: **Settings → Pages → Build and deployment → Source = GitHub Actions** (ou *Deploy from a branch* → `main` → `/ (root)`). Depois aguarde 1–2 minutos.

---

## Segurança

- **Nenhuma API key no repositório.**
- Credenciais só em **cookies do navegador**, após aceite da política.
- **Logout** apaga os cookies.

---

## Como usar no Pages

1. Abra https://engrocha1.github.io/REDMINE/
2. Aceite cookies → informe e-mail, URL do Redmine e API key.
3. Use **↻** para atualizar e **Logout** para sair.

### CORS

O navegador pode bloquear chamadas diretas à API do Redmine (CORS). Nesse caso:

```bash
git clone https://github.com/EngRocha1/REDMINE.git
cd REDMINE && npm install && npm run proxy
# http://localhost:8787
```

O proxy **não grava** a chave — só repassa o header da requisição.

---

## Recursos

- KPIs, cards de sprint, gráficos, matriz, tabela filtrável
- Glossário (M01–M09, [US], [TS], Sprint, Backlog, Scrum…)
- Refresh redondo + Logout

## Licença

MIT © EngRocha1
