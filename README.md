# REDMINE — Dashboard Executivo HEMOPI

Dashboard público HEMOPI 2.0 via Redmine REST API.

**Código:** https://github.com/EngRocha1/REDMINE  
**Site:** https://engrocha1.github.io/REDMINE/

---

## Ativar GitHub Pages (obrigatório — 1 vez, ~20 segundos)

O Actions **não pode ligar o Pages sozinho** na primeira vez (limitação do `GITHUB_TOKEN`). Faça isto:

1. Abra: **https://github.com/EngRocha1/REDMINE/settings/pages**
2. Em **Build and deployment → Source**, selecione **GitHub Actions**
3. Clique em **Save** (se aparecer)
4. Vá em **Actions** → workflow **Deploy GitHub Pages** → **Re-run jobs** no último run (ou faça um commit vazio / push)

Em 1–2 minutos o site sobe em:

### https://engrocha1.github.io/REDMINE/

Alternativa sem Actions: na mesma tela Pages, escolha **Deploy from a branch** → `main` → `/ (root)` → Save. O `index.html` da raiz já é o dashboard.

---

## Segurança

- Nenhuma API key no Git.
- Login grava e-mail + URL + key **só em cookies** do navegador.
- Logout apaga os cookies.

## CORS

Se o Redmine bloquear a API no browser:

```bash
git clone https://github.com/EngRocha1/REDMINE.git
cd REDMINE && npm install && npm run proxy
# http://localhost:8787
```

## Licença

MIT © EngRocha1
