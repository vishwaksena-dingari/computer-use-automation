#!/usr/bin/env bash
# Run a saved capability (deterministic replay, no LLM).
# Usage:
#   ./scripts/run.sh M-10042
#   ./scripts/run.sh M-99999
#   ./scripts/run.sh M-10042 --headed          # visible Chromium window
#   CUA_LOG=debug ./scripts/run.sh M-10042
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MEMBER_ID="M-10042"
CHAPTER=""
EXTRA_ARGS=()
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --headed|--verbose|--escalate)
      EXTRA_ARGS+=("$1")
      ;;
    --chapter)
      shift
      CHAPTER="${1:-}"
      ;;
    --*)
      EXTRA_ARGS+=("$1")
      ;;
    *)
      POSITIONAL+=("$1")
      ;;
  esac
  shift
done

if [[ ${#POSITIONAL[@]} -ge 1 ]]; then
  MEMBER_ID="${POSITIONAL[0]}"
fi
if [[ ${#POSITIONAL[@]} -ge 2 ]]; then
  CHAPTER="${POSITIONAL[1]}"
fi

if [[ ! -d node_modules ]]; then
  echo "Run ./scripts/setup.sh first" >&2
  exit 1
fi
bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

ART="capabilities/lookup-member-savings-balance.json"
ARGS=(replay "$ART" --member-id "$MEMBER_ID")
if [[ -n "$CHAPTER" ]]; then
  ARGS+=(--chapter "$CHAPTER")
elif [[ "$MEMBER_ID" == "M-99999" ]]; then
  ARGS+=(--chapter 03-replay-exception)
elif [[ "$MEMBER_ID" == "M-10042" ]]; then
  ARGS+=(--chapter 02-replay-happy)
fi

exec node dist/cli/main.js "${ARGS[@]}" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"
