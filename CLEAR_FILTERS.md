# Gantt com 0 tasks

## Causa mais comum
Filtros sticky no `localStorage` (`hemopi_shared_filters`), em especial:
- **Desenvolvedor = Sem responsável** (esconde todas as tasks atribuídas)
- **Projeto** só MV sem issues carregadas
- **Módulo** com 1 de 38 selecionado

## Correção imediata (no browser em localhost:8787/gantt.html)
```js
localStorage.removeItem('hemopi_shared_filters');
location.reload();
```

Depois: Filtros → **Limpar filtros** → marcar só **Sprint 7** → conferir **#6500**.

## Pull
```bash
git pull
bash PATCH_GANTT_HTML.sh
# Ctrl+F5 no Gantt
```

O script `gantt-runtime-fix.js` busca issues por versão (inclui #6500 no MV-Api),
limpa filtros que zeraram o board e recarrega.
