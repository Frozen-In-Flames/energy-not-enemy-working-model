#!/bin/sh
# Full verification for the Working Model repo:
#   1. served data copies are byte-identical to the canonical data,
#   2. every JavaScript file parses,
#   3. the three-implementation battery passes (see tests/run_battery.py).
set -e
cd "$(dirname "$0")/.."
cmp data/lewisville-tx-2024-open-meteo.csv docs/data/lewisville-tx-2024-open-meteo.csv
cmp data/lewisville-tx-2024-open-meteo.meta.json docs/data/lewisville-tx-2024-open-meteo.meta.json
cmp results/claims-check.json docs/data/claims-check.json
for f in docs/solver.js docs/gl.js docs/weather.js docs/app.js tests/run_js.js; do
  node --check "$f"
done
python3 tests/run_battery.py
echo "verify: OK"
