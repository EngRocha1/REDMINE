#!/bin/bash
# HEMOPI Gantt — corrige: Kanban DnD, fullscreen, menu viewport, Sem responsavel
set -e
cd "$(dirname "$0")"

echo "==> Backup"
TS=$(date +%H%M%S)
cp -f gantt.js  "gantt.js.bak.$TS" 2>/dev/null || true
cp -f gantt.css "gantt.css.bak.$TS" 2>/dev/null || true

python - <<'PY'
from pathlib import Path
import re, subprocess

js_path = Path("gantt.js")
css_path = Path("gantt.css")
if not js_path.exists():
    raise SystemExit("gantt.js nao encontrado")

js = js_path.read_text(encoding="utf-8", errors="replace")
css = css_path.read_text(encoding="utf-8", errors="replace") if css_path.exists() else ""
changed = []

if "function placeMenu(" not in js:
    marker = "function openStatusMenu"
    idx = js.find(marker)
    if idx < 0:
        marker = "function openAssigneeMenu"
        idx = js.find(marker)
    if idx >= 0:
        helper = r'''
  function placeMenu(menu, x, y) {
    if (!menu) return;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    menu.classList.remove("hidden");
    menu.style.display = "flex";
    menu.style.visibility = "hidden";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.maxHeight = "none";
    var pad = 8;
    var maxH = Math.max(140, window.innerHeight - pad * 2);
    menu.style.maxHeight = maxH + "px";
    var mw = Math.max(menu.offsetWidth || 260, 240);
    var mh = Math.min(menu.scrollHeight || menu.offsetHeight || 200, maxH);
    var left = Math.max(pad, Math.min(x, window.innerWidth - mw - pad));
    var top = y;
    if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
    if (top < pad) top = pad;
    var spaceBelow = window.innerHeight - pad - top;
    if (spaceBelow < mh) {
      menu.style.maxHeight = Math.max(120, spaceBelow) + "px";
    }
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "visible";
  }

'''
        js = js[:idx] + helper + js[idx:]
        changed.append("placeMenu")

js2 = re.sub(
    r'menu\.style\.left\s*=\s*Math\.min\(x,\s*window\.innerWidth\s*-\s*\d+\)\s*\+\s*"px";\s*'
    r'menu\.style\.top\s*=\s*Math\.min\(y,\s*window\.innerHeight\s*-\s*\d+\)\s*\+\s*"px";\s*'
    r'show\(menu\);',
    'placeMenu(menu, x, y);',
    js,
)
if js2 != js:
    js = js2
    changed.append("menu-position->placeMenu")

if 'l: "Sem responsável"' not in js and "chipsAssignee" in js:
    pat = r'renderChips\s*\(\s*"chipsAssignee"\s*,\s*[^,]+,'
    repl = (
        'renderChips("chipsAssignee", '
        '[{ v: "none", l: "Sem responsável" }].concat('
        '(typeof assigneeOptionsFromIssues==="function"?assigneeOptionsFromIssues():[]).map('
        'function(d){return {v:String(d.id),l:d.name};})),'
    )
    js2, n = re.subn(pat, repl, js, count=1)
    if n:
        js = js2
        changed.append("Sem responsavel chip")
elif 'l: "Sem responsável"' in js:
    print("OK Sem responsavel ja no fonte")

if "wantNone" not in js:
    idx = js.find("function applyFilters")
    sub = js.find("if (sel.assignee !== null)", idx if idx >= 0 else 0)
    if sub >= 0:
        depth = 0
        end = None
        for k in range(sub, min(len(js), sub + 700)):
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
            js = js[:sub] + block + js[end + 1 :]
            changed.append("wantNone filter")

if 'dataTransfer.setData("text/plain"' not in js and "dragstart" in js:
    old = 'dragId = +card.dataset.id; card.style.opacity = ".5";'
    new = (
        'dragId = +card.dataset.id;\n'
        '        try { ev.dataTransfer.setData("text/plain", String(dragId)); ev.dataTransfer.effectAllowed = "move"; } catch (err) {}\n'
        '        card.classList.add("dragging"); card.style.opacity = ".55";'
    )
    if old in js:
        js = js.replace(old, new, 1)
        changed.append("dragstart setData")

js2 = re.sub(
    r'card\.addEventListener\("dragend",\s*function\s*\(\)\s*\{\s*card\.style\.opacity\s*=\s*["\']1["\'];\s*dragId\s*=\s*null;\s*\}\);',
    'card.addEventListener("dragend", function () { card.classList.remove("dragging"); card.style.opacity = "1"; setTimeout(function(){ dragId = null; }, 80); });',
    js,
    count=1,
)
if js2 != js:
    js = js2
    changed.append("dragend delay clear")

if "movedId" not in js and 'colBody.addEventListener("drop"' in js:
    old = '''colBody.addEventListener("drop", async function (e) {
        e.preventDefault();
        colBody.classList.remove("drag-over");
        if (!dragId) return;
        var stName = colBody.parentElement.dataset.status;
        var sid = statusIdByName[stName] || FALLBACK[stName];
        if (!sid) { toast("Status sem id: " + stName, true); return; }
        try {
          await api("PUT", "/issues/" + dragId + ".json", { issue: { status_id: sid } });
          var issue = allIssues.find(function (x) { return x.id === dragId; });
          if (issue) issue.status = { id: sid, name: stName };
          toast("#" + dragId + " → " + stName);
          openKanban(versionId, versionName);
          applyFilters();'''
    new = '''colBody.addEventListener("drop", async function (e) {
        e.preventDefault();
        e.stopPropagation();
        colBody.classList.remove("drag-over");
        var movedId = dragId;
        try { var dt = e.dataTransfer && e.dataTransfer.getData("text/plain"); if (dt) movedId = +dt; } catch (err) {}
        if (!movedId) return;
        var stName = colBody.parentElement.dataset.status;
        var sid = statusIdByName[stName] || FALLBACK[stName];
        if (!sid) { toast("Status sem id: " + stName, true); return; }
        var cardEl = board.querySelector('.kanban-card[data-id="' + movedId + '"]');
        if (cardEl) {
          colBody.appendChild(cardEl);
          cardEl.style.opacity = "1";
          cardEl.classList.remove("dragging");
          var stSpan = cardEl.querySelector(".kc-st");
          if (stSpan && typeof shortStatus === "function") stSpan.textContent = shortStatus(stName);
          if (typeof statusClass === "function") { cardEl.className = "kanban-card " + statusClass(stName); cardEl.setAttribute("draggable","true"); }
        }
        try {
          await api("PUT", "/issues/" + movedId + ".json", { issue: { status_id: sid } });
          var issue = allIssues.find(function (x) { return x.id === movedId; });
          if (issue) issue.status = { id: sid, name: stName };
          toast("#" + movedId + " → " + stName);
          openKanban(versionId, versionName);
          applyFilters();'''
    if old in js:
        js = js.replace(old, new, 1)
        changed.append("drop optimistic+dataTransfer")
    else:
        print("WARN: drop block exact nao encontrado")

js2 = js.replace(
    'colBody.addEventListener("dragover", function (e) { e.preventDefault(); colBody.classList.add("drag-over"); });',
    'colBody.addEventListener("dragover", function (e) { e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch (err) {} colBody.classList.add("drag-over"); });',
    1,
)
if js2 != js:
    js = js2
    changed.append("dragover dropEffect")

old_fs = '''fsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var on = card.classList.toggle("is-fs");
        fsBtn.textContent = on ? "⛶" : "⛶";
        fsBtn.title = on ? "Sair da tela cheia" : "Tela cheia";
        if (!on) {
          card.style.left = "";
          card.style.top = "";
          card.style.width = "";
          card.style.height = "";
          card.style.position = "";
          card.style.margin = "";
        }
      });'''
new_fs = '''fsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var on = card.classList.toggle("is-fs");
        fsBtn.textContent = on ? "❐" : "⛶";
        fsBtn.title = on ? "Sair da tela cheia" : "Tela cheia";
        if (on) {
          card.style.position = "fixed";
          card.style.left = "0";
          card.style.top = "0";
          card.style.width = "100vw";
          card.style.height = "100vh";
          card.style.maxWidth = "100vw";
          card.style.maxHeight = "100vh";
          card.style.margin = "0";
          card.style.borderRadius = "0";
          card.style.zIndex = "10040";
        } else {
          card.style.left = "";
          card.style.top = "";
          card.style.width = "";
          card.style.height = "";
          card.style.position = "";
          card.style.margin = "";
          card.style.maxWidth = "";
          card.style.maxHeight = "";
          card.style.borderRadius = "";
          card.style.zIndex = "";
        }
      });'''
if old_fs in js:
    js = js.replace(old_fs, new_fs, 1)
    changed.append("fullscreen")

css_extra = '''
/* runtime fixes */
.kanban-card.dragging{opacity:.55;outline:2px dashed #67e8f9}
.kanban-col-body.drag-over{background:rgba(59,130,246,.12);outline:2px dashed rgba(103,232,249,.5)}
.modal-card.is-fs{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;border-radius:0!important;margin:0!important;z-index:10040!important}
.modal-card.is-fs .modal-resize{display:none}
.status-menu,.assignee-menu{position:fixed!important;z-index:10050!important;max-height:min(70vh,calc(100vh - 16px))!important;overflow-y:auto!important;overflow-x:hidden!important}
'''
if "kanban-card.dragging" not in css:
    css = css + "\n" + css_extra
    changed.append("css-dnd-fs-menu")
if Path("gantt-left-fix.css").exists() and "/* FIX left rails" not in css:
    css = css + "\n" + Path("gantt-left-fix.css").read_text(encoding="utf-8")
    changed.append("css-left-rails")

js_path.write_text(js, encoding="utf-8")
css_path.write_text(css, encoding="utf-8")
print("Alteracoes:", ", ".join(changed) if changed else "(nenhuma — ja aplicado?)")
r = subprocess.run(["node", "--check", "gantt.js"], capture_output=True, text=True)
print("node --check:", "OK" if r.returncode == 0 else r.stderr[:400])
print("sizes:", js_path.stat().st_size, css_path.stat().st_size)
PY

echo ""
echo "Pronto. Rode:"
echo "  npm run proxy"
echo "  http://localhost:8787/gantt.html  -> Ctrl+Shift+R"
echo ""
echo "Checklist:"
echo "  1) Kanban: arrastar card troca de coluna na hora"
echo "  2) Fullscreen (botao no modal) preenche a tela"
echo "  3) Lista de devs cabe na tela e rola ate o fim"
echo "  4) Filtro DESENVOLVEDOR tem chip 'Sem responsavel'"
