#!/usr/bin/env bash
# One-shot: core bank slice + G1 form demos.
# Usage:
#   ./scripts/demo-reviewer.sh              # replay-only (fast; uses saved capability)
#   ./scripts/demo-reviewer.sh --train      # LLM discover first (needs Ollama; no offline seed)
#   ./scripts/demo-reviewer.sh --train --headed   # watch Chromium during discover + replay
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TRAIN=0
HEADED=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --train) TRAIN=1 ;;
    --headed) HEADED=1 ;;
    -h|--help)
      sed -n '2,6p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "unknown flag: $1 (use --train and/or --headed)" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -d node_modules ]]; then
  echo "Run ./scripts/setup.sh first" >&2
  exit 1
fi

bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

RUN_EXTRA=()
TRAIN_EXTRA=()
if [[ "$HEADED" -eq 1 ]]; then
  RUN_EXTRA+=(--headed)
  TRAIN_EXTRA+=(--headed)
fi

if [[ "$TRAIN" -eq 1 ]]; then
  echo "=== Train / discover (LLM locators; no offline seed) ===" >&2
  # Fail closed if Ollama is down — do not fall back to a figured-out seed JSON.
  ./scripts/train.sh "${TRAIN_EXTRA[@]+"${TRAIN_EXTRA[@]}"}"
fi

echo "=== Core mock (happy) ===" >&2
./scripts/run.sh M-10042 "${RUN_EXTRA[@]+"${RUN_EXTRA[@]}"}"
echo "=== Core mock (exception) ===" >&2
./scripts/run.sh M-99999 "${RUN_EXTRA[@]+"${RUN_EXTRA[@]}"}"
echo "=== G1 forms (Co A/B/C) ===" >&2
bash "$ROOT/scripts/demo-g1-forms.sh"
echo "=== demo-reviewer ok ===" >&2
