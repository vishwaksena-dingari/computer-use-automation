#!/usr/bin/env bash
# Train / discover: observe mock → LLM emits locators → writes capabilities/*.json
# Usage: ./scripts/train.sh ["goal text"] [--headed] [--verbose] [--model id] [--allow-offline-seed --seed path]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GOAL="Look up member savings balance"
ARGS=()
OFFLINE=0
SEED=""

if [[ $# -gt 0 && "$1" != --* ]]; then
  GOAL="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-offline-seed|--offline) OFFLINE=1 ;;
    --seed)
      shift
      SEED="${1:-}"
      ;;
    --no-offline) OFFLINE=0 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

if [[ ! -d node_modules ]]; then
  echo "Run ./scripts/setup.sh first" >&2
  exit 1
fi
bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

CMD=(node dist/cli/main.js discover --goal "$GOAL" --out capabilities/lookup-member-savings-balance.json)
if [[ "$OFFLINE" -eq 1 ]]; then
  if [[ -z "$SEED" ]]; then
    echo "offline train requires: --allow-offline-seed --seed .private/golden-capabilities/lookup-member-savings-balance.json" >&2
    exit 1
  fi
  CMD+=(--allow-offline-seed --seed "$SEED")
fi
CMD+=("${ARGS[@]+"${ARGS[@]}"}")
exec "${CMD[@]}"
