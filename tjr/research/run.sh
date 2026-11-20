#!/usr/bin/env bash
# Reproduces docs/tjr/results.md from the two data files (see docs/tjr/research-protocol.md). Run from tjr/.
set -euo pipefail
PY="${PY:-python}"
NQ="${NQ:-data/NQ_1m_2024-11-25_2026-11-20_massive.csv}"
ES="${ES:-data/ES_1m_2024-11-25_2026-11-20_massive.csv}"
SRC="Massive futures aggregates, 1-minute (api.massive.com), Futures Basic plan, downloaded 2026-11-20"
ROLL="front contract until 4 days before the third Friday, switched at 18:00 New York the evening before"
COMMON=(--data "NQ=$NQ" "ES=$ES" --source "$SRC" --roll-method "$ROLL" --set risk.start_equity=100000)
case "${1:-all}" in
  1|all) "$PY" -m jtjr compare "${COMMON[@]}" --out reports/exp1-as-specified ;;&
  2|all) "$PY" -m jtjr walkforward "${COMMON[@]}" --model A --grid research/grid-model-A.json --min-trades 15 --jobs 4 --ledger reports/test-ledger.json --out reports/exp2-walkforward-A ;;&
  3|all) "$PY" -m jtjr walkforward "${COMMON[@]}" --model E --grid research/grid-model-E.json --min-trades 15 --jobs 4 --ledger reports/test-ledger.json --out reports/exp3-walkforward-E ;;
esac
