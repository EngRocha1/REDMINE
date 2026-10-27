#!/bin/bash
# Instala gantt.js / gantt.css / gantt.html a partir de gantt_parts/*.b64
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if [ ! -d gantt_parts ]; then
  echo "Pasta gantt_parts nao encontrada. Rode: git pull origin main"
  exit 1
fi
python - <<'PY'
from pathlib import Path
import base64, subprocess
root = Path('.')
parts = root / 'gantt_parts'
def assemble(prefix, outname):
    files = sorted(parts.glob(prefix + '.*.b64'))
    if not files:
        raise SystemExit('Faltam partes: ' + prefix)
    data = ''.join(f.read_text().strip() for f in files)
    raw = base64.b64decode(data)
    Path(outname).write_bytes(raw)
    print('OK', outname, len(raw), 'bytes (', len(files), 'partes)')
assemble('js', 'gantt.js')
assemble('css', 'gantt.css')
assemble('html', 'gantt.html')
r = subprocess.run(['node','--check','gantt.js'], capture_output=True, text=True)
print('node --check:', 'OK' if r.returncode==0 else r.stderr[:400])
t = Path('gantt.js').read_text(encoding='utf-8', errors='replace')
print('checks:', 'Sem respons' in t, 'movedId' in t, 'placeMenu' in t, 'setData' in t)
PY
echo ""
echo "Pronto. Agora:"
echo "  npm run proxy"
echo "  http://localhost:8787/gantt.html  -> Ctrl+Shift+R"
