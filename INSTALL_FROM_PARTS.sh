#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "==> Montando app.js e gantt.js a partir das partes b64"
python3 - <<'PY'
from pathlib import Path
import base64

def assemble(prefix, out):
    parts = sorted(Path(".").glob(f"{prefix}.part*.b64"))
    if not parts:
        print(f"ERRO: nenhuma parte {prefix}.part*.b64")
        return False
    data = b"".join(base64.b64decode(p.read_text().strip()) for p in parts)
    Path(out).write_bytes(data)
    print(f"OK {out} ({len(data)} bytes) de {len(parts)} partes")
    return True

ok1 = assemble("app.js", "app.js")
ok2 = assemble("gantt.js", "gantt.js")
if not (ok1 and ok2):
    raise SystemExit(1)
print("Pronto. Reinicie o proxy se estiver rodando.")
PY
