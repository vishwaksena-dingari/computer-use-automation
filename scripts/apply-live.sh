#!/usr/bin/env bash
# @file One-shot live apply: optional vault/resume copy → local cua apply (fill-only unless --submit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

URL=""
PROFILE=".private/profile.json"
PROFILE_FROM=""
RESUME=""
PLAN_JSON=""
ATS="auto"
MODE="deterministic"
COMPANY_CONTEXT=""
EVIDENCE=""
HEADED=0
ESCALATE=0
SUBMIT=0
WRITE_MAP=0
FIELD_MAP_ID=""

usage() {
  cat <<'EOF' >&2
usage: apply-live.sh --url <ashby|/application url> [options]

  --url URL                 Required apply URL (prefer …/application)
  --profile-from PATH       Copy vault JSON via copy-vault-private.sh
  --resume PATH             Resume PDF (used with --profile-from, or copies alone)
  --profile PATH            Profile under repo (default .private/profile.json)
  --plan-json PATH          Optional upstream plan → FieldMap
  --field-map-id ID         Seed FieldMap id (.private/field-maps or capabilities/)
  --ats ashby|lever|…       Default auto
  --mode deterministic|hybrid
  --company-context TEXT    Hybrid craft company/role blurb
  --evidence DIR            Evidence chapter (default evidence/private/live-<stamp>)
  --headed                  Show browser
  --escalate                HITL pause on captcha/stuck
  --submit                  Click Submit (OFF by default — irreversible; also needs CUA_LIVE_SUBMIT_GO=1)
  --write-field-map         Persist repaired field-map into tracked capabilities/
EOF
  exit 1
}

rewrite_resume_path() {
  local profile_path="$1"
  python3 - "$profile_path" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
data["resumePath"] = ".private/resume.pdf"
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
import os
os.replace(tmp, path)
print("Set resumePath → .private/resume.pdf")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --profile-from) PROFILE_FROM="${2:-}"; shift 2 ;;
    --resume) RESUME="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --plan-json) PLAN_JSON="${2:-}"; shift 2 ;;
    --field-map-id) FIELD_MAP_ID="${2:-}"; shift 2 ;;
    --ats) ATS="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --company-context) COMPANY_CONTEXT="${2:-}"; shift 2 ;;
    --evidence) EVIDENCE="${2:-}"; shift 2 ;;
    --headed) HEADED=1; shift ;;
    --escalate) ESCALATE=1; shift ;;
    --submit) SUBMIT=1; shift ;;
    --write-field-map) WRITE_MAP=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[[ -n "$URL" ]] || usage

if [[ -n "$PROFILE_FROM" ]]; then
  bash "$ROOT/scripts/copy-vault-private.sh" "$PROFILE_FROM" ${RESUME:+"$RESUME"}
  PROFILE=".private/profile.json"
elif [[ -n "$RESUME" ]]; then
  mkdir -p .private
  cp "$RESUME" .private/resume.pdf
  echo "Copied resume → .private/resume.pdf"
  if [[ -f "$PROFILE" ]]; then
    rewrite_resume_path "$PROFILE"
  else
    echo "warn: profile missing at $PROFILE — resume copied but resumePath not rewritten" >&2
  fi
fi

if [[ ! -f "$PROFILE" ]]; then
  echo "missing profile: $PROFILE (use --profile-from or copy into .private/)" >&2
  exit 1
fi

CUA_BIN="$ROOT/dist/cli/main.js"
if [[ ! -f "$CUA_BIN" ]]; then
  echo "missing $CUA_BIN — run: npm run build" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
EVIDENCE="${EVIDENCE:-evidence/private/live-$STAMP}"
mkdir -p evidence/private

ARGS=(apply --url "$URL" --profile "$PROFILE" --ats "$ATS" --mode "$MODE" --evidence "$EVIDENCE")
[[ -n "$PLAN_JSON" ]] && ARGS+=(--plan-json "$PLAN_JSON")
[[ -n "$FIELD_MAP_ID" ]] && ARGS+=(--field-map-id "$FIELD_MAP_ID")
[[ -n "$COMPANY_CONTEXT" ]] && ARGS+=(--company-context "$COMPANY_CONTEXT")
[[ "$HEADED" -eq 1 ]] && ARGS+=(--headed)
[[ "$ESCALATE" -eq 1 ]] && ARGS+=(--escalate)
[[ "$SUBMIT" -eq 1 ]] && ARGS+=(--submit)
[[ "$WRITE_MAP" -eq 1 ]] && ARGS+=(--write-field-map)

if [[ "$SUBMIT" -eq 1 ]]; then
  # Hard operator GO — irreversible live submit must not be a flag typo.
  if [[ "${CUA_LIVE_SUBMIT_GO:-}" != "1" ]]; then
    echo "refusing --submit: set CUA_LIVE_SUBMIT_GO=1 after explicit operator GO" >&2
    echo "fill-only is the default; deletion criterion: .scratch/land-python-assist-deletion-criterion.md" >&2
    exit 2
  fi
  echo "mode: SUBMIT (irreversible; CUA_LIVE_SUBMIT_GO=1) → $URL"
else
  echo "mode: fill-only → $URL"
fi

node "$CUA_BIN" "${ARGS[@]}"
echo "evidence → $EVIDENCE"
