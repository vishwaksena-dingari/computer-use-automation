#!/usr/bin/env bash
# Optional retarget experiment: Sauce Demo (NOT the graded mock-core slice).
# Usage: ./scripts/try-sauce.sh [--headed] [--bad-login]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXTRA=()
BAD=0
for a in "$@"; do
  case "$a" in
    --bad-login) BAD=1 ;;
    *) EXTRA+=("$a") ;;
  esac
done

npm run build --silent

ART="capabilities/sauce-demo-open-inventory.json"
BASE="https://www.saucedemo.com"
USER="standard_user"
PASS="secret_sauce"
CHAPTER="experiments/sauce-happy"
if [[ "$BAD" -eq 1 ]]; then
  USER="locked_out_user"
  CHAPTER="experiments/sauce-auth-failed"
fi

echo "[cua] sauce experiment → $CHAPTER (graded evidence remains 01–03 mock-core)" >&2
exec node dist/cli/main.js replay "$ART" \
  --base-url "$BASE" \
  --member-id ignored \
  --param "username=$USER" \
  --param "password=$PASS" \
  --chapter "$CHAPTER" \
  "${EXTRA[@]+"${EXTRA[@]}"}"
