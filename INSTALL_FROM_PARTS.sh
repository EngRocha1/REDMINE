#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
from pathlib import Path
import base64

def assemble(prefix, out):
    parts = sorted(Path(".").glob(f"{prefix}.p*.b64"))
    if not parts:
        parts = sorted(Path(".").glob(f"{prefix}.part*.b64"))
    if not parts:
        print(f"skip {prefix}: no parts")
        return False
    data = b"".join(base64.b64decode(p.read_text().strip()) for p in parts)
    Path(out).write_bytes(data)
    print(f"OK {out} ({len(data)} bytes) from {len(parts)} parts")
    return True

ok = assemble("app.js", "app.js")
ok2 = assemble("gantt.js", "gantt.js")
raise SystemExit(0 if (ok and ok2) else 1)
PY
