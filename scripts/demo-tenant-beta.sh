#!/usr/bin/env bash
# @file S8 demo: same capability + tenant-beta bindings against beta mock skin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
./scripts/ensure-mock.sh
ART="${1:-capabilities/lookup-member-savings-balance.json}"
BIND="capabilities/bindings/tenant-beta.json"
MEMBER="${MEMBER_ID:-M-10042}"
npx --yes tsx src/cli/main.ts replay "$ART" \
  --bindings "$BIND" \
  --member-id "$MEMBER" \
  --chapter experiments/tenant-beta \
  "$@"
