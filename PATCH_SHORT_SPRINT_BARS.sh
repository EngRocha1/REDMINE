#!/bin/bash
# Injeta bar CURTA (2 dias) no início da sprint para tasks sem start/due
set -e
cd "$(dirname "$0")"
cp -f gantt.js "gantt.js.bak.short.$(date +%H%M%S)"

python - <<'PY'
from pathlib import Path
import subprocess

js = Path("gantt.js").read_text(encoding="utf-8", errors="replace")
if "shortOnSprint" in js:
    print("OK shortOnSprint ja presente")
else:
    old = '''      } else {
        var s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
        var e = parseYMD(issue.due_date) || s;
        if (s && e) {
          i0 = findCol(s);
          i1 = findCol(e);
          if (i0 < 0) i0 = findCol(e);
          if (i1 < 0) i1 = i0;
          if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
        }
      }
      if (i0 != null && i0 >= 0) {'''

    new = '''      } else {
        var s = parseYMD(issue.start_date) || parseYMD(issue.due_date);
        var e = parseYMD(issue.due_date) || s;
        var shortOnSprint = false;
        if (!s || !e) {
          if (issue.fixed_version && issue.fixed_version.id != null) {
            for (var bb2 = 0; bb2 < bands.length; bb2++) {
              if (!bands[bb2].backlog && String(bands[bb2].versionId) === String(issue.fixed_version.id)) {
                i0 = bands[bb2].from + 1;
                i1 = Math.min(i0 + 1, bands[bb2].from + bands[bb2].span - 1);
                if (i1 < i0) i1 = i0;
                shortOnSprint = true;
                break;
              }
            }
            if (!shortOnSprint && typeof versionPeriod === "function" && typeof addDays === "function") {
              var ver = null;
              for (var vi = 0; vi < versions.length; vi++) {
                if (String(versions[vi].id) === String(issue.fixed_version.id)) { ver = versions[vi]; break; }
              }
              if (ver) {
                var vp = versionPeriod(ver);
                if (vp && vp.start) { s = vp.start; e = addDays(vp.start, 1); }
              }
            }
          }
        }
        if (!shortOnSprint && s && e) {
          i0 = findCol(s);
          i1 = findCol(e);
          if (i0 < 0) i0 = findCol(e);
          if (i1 < 0) i1 = i0;
          if (i1 < i0) { var t = i0; i0 = i1; i1 = t; }
        }
      }
      if (i0 != null && i0 >= 0) {'''

    if old in js:
        js = js.replace(old, new, 1)
        Path("gantt.js").write_text(js, encoding="utf-8")
        print("OK shortOnSprint injetado")
    else:
        print("WARN: bloco de datas nao encontrado no gantt.js local")

r = subprocess.run(["node", "--check", "gantt.js"], capture_output=True, text=True)
print("node --check:", "OK" if r.returncode == 0 else r.stderr[:300])
print("shortOnSprint in file:", "shortOnSprint" in Path("gantt.js").read_text(encoding="utf-8", errors="replace"))
PY
echo "Pronto."
