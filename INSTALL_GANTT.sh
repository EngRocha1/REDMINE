#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 -c '
import base64, pathlib
parts = []
for i in range(4):
    p = pathlib.Path("gantt.part%d.b64" % i)
    if not p.exists():
        raise SystemExit("faltando " + str(p))
    parts.append(base64.b64decode(p.read_text().strip()))
data = b"".join(parts)
pathlib.Path("gantt.js").write_bytes(data)
print("gantt.js", len(data), "bytes")
print(data[:40])
'
test "$(wc -c < gantt.js)" -gt 40000 || { echo "ERRO: arquivo incompleto"; exit 1; }
head -n 1 gantt.js
echo "OK. Rode: npm run proxy"
echo "Depois: http://localhost:8787/gantt.html  (Ctrl+Shift+R)"
