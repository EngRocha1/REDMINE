#!/bin/bash
# HEMOPI Gantt — coluna esquerda + Sem responsavel + fechar menus no modal
set -e
cd "$(dirname "$0")"

echo "==> Backup"
TS=$(date +%H%M%S)
cp -f gantt.css "gantt.css.bak.$TS" 2>/dev/null || true
cp -f gantt.js  "gantt.js.bak.$TS" 2>/dev/null || true

echo "==> CSS: trilhos da coluna esquerda"
if [ -f gantt-left-fix.css ]; then
  python -c "
from pathlib import Path
p=Path('gantt.css')
t=p.read_text(encoding='utf-8',errors='replace')
m='/* FIX left rails'
if m in t:
    t=t.split(m)[0].rstrip()+'\n'
fix=Path('gantt-left-fix.css').read_text(encoding='utf-8')
p.write_text(t+'\n'+fix+'\n',encoding='utf-8')
print('CSS size', p.stat().st_size)
"
else
  echo "ERRO: gantt-left-fix.css nao encontrado na mesma pasta"
  exit 1
fi

echo "==> JS: Sem responsavel + fechar menus"
python - <<'PY'
from pathlib import Path
import re, subprocess
js_path = Path("gantt.js")
js = js_path.read_text(encoding="utf-8", errors="replace")
changed = False

if 'l: "Sem responsável"' not in js and "chipsAssignee" in js:
    pat = r'renderChips\s*\(\s*"chipsAssignee"\s*,\s*[^,]+,'
    repl = 'renderChips("chipsAssignee", [{ v: "none", l: "Sem responsável" }].concat((typeof assigneeOptionsFromIssues==="function"?assigneeOptionsFromIssues():[]).map(function(d){return {v:String(d.id),l:d.name};})),'
    newjs, n = re.subn(pat, repl, js, count=1)
    if n:
        js = newjs
        changed = True
        print("OK chipsAssignee + Sem responsavel")
    else:
        print("WARN: padrao chipsAssignee nao encontrado")
elif 'l: "Sem responsável"' in js:
    print("OK Sem responsavel ja presente")
else:
    print("WARN: chipsAssignee ausente")

if "wantNone" not in js and "sel.assignee" in js:
    idx = js.find("function applyFilters")
    sub = js.find("if (sel.assignee !== null)", idx if idx >= 0 else 0)
    if sub >= 0:
        depth = 0
        start = sub
        end = None
        for k in range(sub, min(len(js), sub + 600)):
            if js[k] == "{":
                depth += 1
            elif js[k] == "}":
                depth -= 1
                if depth == 0:
                    end = k
                    break
        if end is not None:
            block = (
                'if (sel.assignee !== null) {\n'
                '        var aid = i.assigned_to && i.assigned_to.id;\n'
                '        var wantNone = sel.assignee.indexOf("none") >= 0 || sel.assignee.indexOf(null) >= 0;\n'
                '        var matchId = aid != null && (sel.assignee.indexOf(aid) >= 0 || sel.assignee.indexOf(String(aid)) >= 0);\n'
                '        var matchNone = wantNone && aid == null;\n'
                '        if (!matchId && !matchNone) return false;\n'
                '      }'
            )
            js = js[:start] + block + js[end + 1 :]
            changed = True
            print("OK applyFilters wantNone")
    else:
        print("WARN: bloco sel.assignee nao encontrado")
else:
    if "wantNone" in js:
        print("OK wantNone ja presente")

m = re.search(r'(async\s+)?function\s+openIssueDetail\s*\([^)]*\)\s*\{', js)
if m:
    window = js[m.end() : m.end() + 220]
    if "statusMenu" not in window:
        inject = (
            '\n    try{var _sm=document.getElementById("statusMenu");if(_sm)_sm.classList.add("hidden");}catch(e){}'
            '\n    try{var _am=document.getElementById("assigneeMenu");if(_am)_am.classList.add("hidden");}catch(e){}\n'
        )
        js = js[: m.end()] + inject + js[m.end() :]
        changed = True
        print("OK openIssueDetail fecha menus")
    else:
        print("OK openIssueDetail ja fecha menus")
else:
    print("WARN: openIssueDetail nao encontrado")

m = re.search(r'function\s+openKanban\s*\([^)]*\)\s*\{', js)
if m:
    window = js[m.end() : m.end() + 250]
    if "statusMenu" not in window:
        inject = (
            '\n    try{var _sm=document.getElementById("statusMenu");if(_sm)_sm.classList.add("hidden");}catch(e){}'
            '\n    try{var _am=document.getElementById("assigneeMenu");if(_am)_am.classList.add("hidden");}catch(e){}\n'
        )
        js = js[: m.end()] + inject + js[m.end() :]
        changed = True
        print("OK openKanban fecha menus")
    else:
        print("OK openKanban ja fecha menus")

if changed:
    js_path.write_text(js, encoding="utf-8")
    print("JS gravado", js_path.stat().st_size)
else:
    print("JS sem alteracao (ja estava ok)")

r = subprocess.run(["node", "--check", "gantt.js"], capture_output=True, text=True)
print("node --check:", "OK" if r.returncode == 0 else r.stderr[:400])
PY

echo "==> Tamanhos"
wc -c gantt.js gantt.css
echo ""
echo "Pronto."
echo "  npm run proxy"
echo "  http://localhost:8787/gantt.html  ->  Ctrl+Shift+R"
echo "  Filtro DESENVOLVEDOR deve ter o chip: Sem responsavel"
echo "  Coluna esquerda: trilhos estreitos (22px) alinhados as linhas das tasks"
