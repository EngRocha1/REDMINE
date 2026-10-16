#!/bin/bash
# Opcional: gera gantt.full.js monolítico a partir das partes
set -e
cd "$(dirname "$0")"
cat gantt.src.part0.js gantt.src.part1.js gantt.src.part2.js gantt.src.part3.js > gantt.full.js
BYTES=$(wc -c < gantt.full.js)
echo "gantt.full.js = $BYTES bytes"
if [ "$BYTES" -lt 40000 ]; then
  echo "ERRO: partes incompletas"
  exit 1
fi
head -n 2 gantt.full.js
echo "OK. Com o loader (padrão em gantt.js), basta: npm run proxy"
echo "http://localhost:8787/gantt.html  Ctrl+Shift+R"
