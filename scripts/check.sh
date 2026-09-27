#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 -m py_compile app.py
python3 - <<'PY'
import ast
from pathlib import Path
ast.parse(Path('app.py').read_text(encoding='utf-8'))
print('OK: app.py Syntaxprüfung bestanden.')
PY

for f in templates/index.html static/app.js static/style.css static/manifest.json service-worker.js; do
  test -f "$f" || { echo "FEHLT: $f"; exit 1; }
done

echo "OK: Projektstruktur vollständig."
