#!/usr/bin/env bash
# @file Career-data queue item → cua apply (Cluster 2 handshake). In-repo mirror of
# career-data …/cua_apply_shim.sh. Does NOT delete ui_assist_playwright.py.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAREER_ROOT="${CAREER_ROOT:-$HOME/Developer/career-data}"
PROFILE="${1:-}"
ITEM="${2:-}"
PLAN_JSON="${3:-}"
SUBMIT=0
HEADED=0

usage() {
  echo "usage: $0 <profile.json> <item.json> [plan.json] [--submit] [--headed]" >&2
  echo "env: CAREER_ROOT (default ~/Developer/career-data)" >&2
  echo "--submit also requires CUA_LIVE_SUBMIT_GO=1 (see apply-live.sh)" >&2
  exit 1
}

[[ -n "$PROFILE" && -f "$PROFILE" && -n "$ITEM" && -f "$ITEM" ]] || usage
shift 2 || true
[[ $# -gt 0 && -f "${1:-}" ]] && { PLAN_JSON="$1"; shift; } || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --submit) SUBMIT=1; shift ;;
    --headed) HEADED=1; shift ;;
    *) usage ;;
  esac
done

[[ -f "$ROOT/dist/cli/main.js" ]] || { echo "build first: npm run build" >&2; exit 1; }

RESUME="$(python3 - "$ITEM" <<'PY'
import json,sys
item=json.load(open(sys.argv[1]))
print((item.get("paths") or {}).get("pdf") or "")
PY
)"

COPY_ARGS=("$PROFILE")
[[ -n "$RESUME" && -f "$RESUME" ]] && COPY_ARGS+=("$RESUME")
[[ -n "$RESUME" && ! -f "$RESUME" && -f "$CAREER_ROOT/$RESUME" ]] && COPY_ARGS+=("$CAREER_ROOT/$RESUME")

"$ROOT/scripts/copy-vault-private.sh" --vault-root "$CAREER_ROOT" "${COPY_ARGS[@]}"

CLAIM="$ROOT/.private/claim.json"
python3 - "$ITEM" "$PLAN_JSON" "$SUBMIT" "$HEADED" "$CLAIM" <<'PY'
import json,sys
item=json.load(open(sys.argv[1]))
plan,submit,headed,out=sys.argv[2],sys.argv[3]=="1",sys.argv[4]=="1",sys.argv[5]
url=item.get("url") or item.get("apply_url")
if not url: raise SystemExit("item missing url")
claim={"schemaVersion":1,"url":url,"profile":".private/profile.json","submit":submit,"headed":headed,"escalate":True}
if plan: claim["planJson"]=".private/plan.json"
with open(out,"w") as f:
    json.dump(claim,f,indent=2); f.write("\n")
print("wrote", out)
PY

if [[ -n "$PLAN_JSON" && -f "$PLAN_JSON" ]]; then
  cp "$PLAN_JSON" "$ROOT/.private/plan.json"
  echo "Copied plan → .private/plan.json"
fi

ARGS=(apply --claim-json .private/claim.json)
[[ "$SUBMIT" -eq 1 ]] || ARGS+=(--no-submit)
[[ "$HEADED" -eq 1 ]] && ARGS+=(--headed)
if [[ "$SUBMIT" -eq 1 && "${CUA_LIVE_SUBMIT_GO:-}" != "1" ]]; then
  echo "refusing --submit: set CUA_LIVE_SUBMIT_GO=1 after explicit operator GO" >&2
  exit 2
fi
(
  cd "$ROOT"
  node dist/cli/main.js "${ARGS[@]}"
)
