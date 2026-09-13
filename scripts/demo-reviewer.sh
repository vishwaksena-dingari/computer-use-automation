#!/usr/bin/env bash
# One-shot: core bank slice + G1 form demos.
# Usage: ./scripts/demo-reviewer.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Run ./scripts/setup.sh first" >&2
  exit 1
fi

bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

echo "=== Core mock (happy) ===" >&2
./scripts/run.sh M-10042
echo "=== Core mock (exception) ===" >&2
./scripts/run.sh M-99999
echo "=== G1 forms (Co A/B/C) ===" >&2
bash "$ROOT/scripts/demo-g1-forms.sh"
echo "=== demo-reviewer ok ===" >&2
