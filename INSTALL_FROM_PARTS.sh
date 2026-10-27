#!/bin/bash
# Reconstroi app.js e gantt.js a partir das partes base64 no repositorio
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
from pathlib import Path
import base64, glob, sys

def assemble(prefix, outname):
    parts = sorted(glob.glob(f"{prefix}.part*.b64"))
    if not parts:
        print(f"ERRO: nenhuma parte {prefix}.part*.b64", file=sys.stderr)
        sys.exit(1)
    data = "".join(Path(p).read_text().strip() for p in parts)
    Path(outname).write_bytes(base64.b64decode(data))
    print(f"OK {outname} ({Path(outname).stat().st_size} bytes) de {len(parts)} partes")

assemble("app.js", "app.js")
if glob.glob("gantt.js.part*.b64"):
    assemble("gantt.js", "gantt.js")
print("Pronto. Hard-refresh no browser (Ctrl+F5).")
PY
