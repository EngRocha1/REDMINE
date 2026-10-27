#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "==> Instalando gantt.js a partir de gantt_parts/js.*.b64"
python - <<'PY'
from pathlib import Path
import base64, subprocess
parts_dir = Path("gantt_parts")
files = sorted(parts_dir.glob("js.*.b64"))
if not files:
    raise SystemExit("Nenhuma parte js.*.b64 em gantt_parts/")
data = "".join(f.read_text().strip() for f in files)
raw = base64.b64decode(data)
Path("gantt.js").write_bytes(raw)
print("OK gantt.js", len(raw), "bytes de", len(files), "partes")
r = subprocess.run(["node", "--check", "gantt.js"], capture_output=True, text=True)
print("node --check:", "OK" if r.returncode == 0 else r.stderr[:300])
t = raw.decode("utf-8", errors="replace")
print("shortOnSprint:", "shortOnSprint" in t)
print("movedId:", "movedId" in t)
print("placeMenu:", "placeMenu" in t)
PY
if [ -f gantt-hotfix.js ]; then
  echo "OK gantt-hotfix.js presente"
else
  echo "WARN: gantt-hotfix.js ausente — git pull"
fi
grep -q gantt-hotfix.js gantt.html && echo "OK html referencia hotfix" || echo "WARN: adicione script hotfix"
echo ""
echo "npm run proxy && Ctrl+Shift+R em http://localhost:8787/gantt.html"
