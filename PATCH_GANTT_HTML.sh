#!/bin/bash
set -e
cd "$(dirname "$0")"
if grep -q 'gantt-runtime-fix.js' gantt.html 2>/dev/null; then
  echo "gantt.html already wired"
else
  if grep -q 'gantt.js' gantt.html; then
    # portable insert after gantt.js script tag
    python3 - <<'PY'
from pathlib import Path
p = Path("gantt.html")
t = p.read_text(encoding="utf-8")
old = '<script src="gantt.js"></script>'
new = old + '\n<script src="gantt-runtime-fix.js"></script>'
if old in t and "gantt-runtime-fix.js" not in t:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("wired gantt-runtime-fix.js into gantt.html")
else:
    print("skip wire", "already" if "gantt-runtime-fix.js" in t else "no gantt.js tag")
PY
  else
    echo "gantt.html missing gantt.js tag" >&2
    exit 1
  fi
fi
echo "Done. Clear sticky filters: open DevTools console and run:"
echo "  localStorage.removeItem('hemopi_shared_filters'); location.reload();"
