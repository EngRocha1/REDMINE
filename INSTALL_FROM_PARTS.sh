#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
from pathlib import Path
import base64

def assemble(prefix, out):
    for pattern in [f"{prefix}.s*.b64", f"{prefix}.p*.b64", f"{prefix}.b64chunk.*.txt"]:
        parts = sorted(Path(".").glob(pattern))
        if not parts:
            continue
        if "chunk" in pattern:
            b64 = "".join(p.read_text() for p in parts)
            data = base64.b64decode("".join(b64.split()))
        else:
            data = b"".join(base64.b64decode(p.read_text().strip()) for p in parts)
        Path(out).write_bytes(data)
        print(f"OK {out} ({len(data)} bytes) via {pattern} x{len(parts)}")
        return True
    print(f"skip {prefix}")
    return False

ok = assemble("app.js", "app.js")
ok2 = assemble("gantt.js", "gantt.js")
raise SystemExit(0 if (ok and ok2) else 1)
PY
