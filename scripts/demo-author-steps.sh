#!/usr/bin/env bash
# G2: LLM-authored step graph (capped) against local mock — writes experiments/ only.
# Usage:
#   ./scripts/demo-author-steps.sh
#   ./scripts/demo-author-steps.sh --headed
# Needs Ollama (same default model as config). Does NOT touch graded lookup capability.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HEADED=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headed) HEADED=1 ;;
    -h|--help)
      sed -n '2,7p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
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
mkdir -p capabilities/experiments

OUT="capabilities/experiments/authored-member-lookup.json"
EVID="evidence/private/g2-author-steps-demo"
CMD=(
  node dist/cli/main.js discover
  --author-steps
  --goal "Look up member savings balance"
  --out "$OUT"
  --evidence "$EVID"
)
if [[ "$HEADED" -eq 1 ]]; then
  CMD+=(--headed)
fi

echo "=== G2 author-steps (Zod-capped; experiments/ only) ===" >&2
"${CMD[@]}"
echo "=== Replay authored artifact (deterministic) ===" >&2
REPLAY=(node dist/cli/main.js replay "$OUT" --member-id M-10042 --evidence evidence/private/g2-author-replay-happy)
if [[ "$HEADED" -eq 1 ]]; then REPLAY+=(--headed); fi
"${REPLAY[@]}"
echo "=== demo-author-steps ok ===" >&2
