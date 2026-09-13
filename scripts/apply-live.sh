#!/usr/bin/env bash
# @file One-shot live apply: optional vault/resume copy → cua apply (fill-only unless --submit).
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
EVIDENCE=""
HEADED=0
ESCALATE=0
SUBMIT=0
WRITE_MAP=0

usage() {
  cat <<'EOF' >&2
usage: apply-live.sh --url <ashby|/application url> [options]

  --url URL                 Required apply URL (prefer …/application)
  --profile-from PATH       Copy vault JSON via copy-vault-private.sh
  --resume PATH             Resume PDF (used with --profile-from, or copies alone)
  --profile PATH            Profile under repo (default .private/profile.json)
  --plan-json PATH          Optional upstream plan → FieldMap
  --ats ashby|lever|…       Default auto
  --mode deterministic|hybrid
  --evidence DIR            Evidence chapter (default evidence/private/live-<stamp>)
  --headed                  Show browser
  --escalate                HITL pause on captcha/stuck
  --submit                  Click Submit (OFF by default — irreversible)
  --write-field-map         Persist repaired FieldMap even when seed exists
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --profile-from) PROFILE_FROM="${2:-}"; shift 2 ;;
    --resume) RESUME="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --plan-json) PLAN_JSON="${2:-}"; shift 2 ;;
    --ats) ATS="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
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
fi

if [[ ! -f "$PROFILE" ]]; then
  echo "missing profile: $PROFILE (use --profile-from or copy into .private/)" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
EVIDENCE="${EVIDENCE:-evidence/private/live-$STAMP}"
mkdir -p evidence/private

ARGS=(apply --url "$URL" --profile "$PROFILE" --ats "$ATS" --mode "$MODE" --evidence "$EVIDENCE")
[[ -n "$PLAN_JSON" ]] && ARGS+=(--plan-json "$PLAN_JSON")
[[ "$HEADED" -eq 1 ]] && ARGS+=(--headed)
[[ "$ESCALATE" -eq 1 ]] && ARGS+=(--escalate)
[[ "$SUBMIT" -eq 1 ]] && ARGS+=(--submit)
[[ "$WRITE_MAP" -eq 1 ]] && ARGS+=(--write-field-map)

if [[ "$SUBMIT" -eq 1 ]]; then
  echo "mode: SUBMIT (irreversible) → $URL"
else
  echo "mode: fill-only → $URL"
fi

npx cua "${ARGS[@]}"
echo "evidence → $EVIDENCE"
