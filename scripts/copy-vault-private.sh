#!/usr/bin/env bash
# Copy career-data vault profile (+ optional resume) into gitignored .private/ for cua apply.
# Path jail requires files under the interface-ai repo; normalizeApplyProfile reads vault keys as-is.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_SRC="${1:-}"
RESUME_SRC="${2:-}"
if [[ -z "$PROFILE_SRC" || ! -f "$PROFILE_SRC" ]]; then
  echo "usage: $0 /path/to/apply-profile.json [/path/to/resume.pdf]" >&2
  exit 1
fi
mkdir -p "$ROOT/.private"
cp "$PROFILE_SRC" "$ROOT/.private/profile.json"
echo "Copied profile → .private/profile.json"
if [[ -n "$RESUME_SRC" ]]; then
  if [[ ! -f "$RESUME_SRC" ]]; then
    echo "resume not found: $RESUME_SRC" >&2
    exit 1
  fi
  cp "$RESUME_SRC" "$ROOT/.private/resume.pdf"
  echo "Copied resume → .private/resume.pdf"
  if ! grep -q '"resumePath"' "$ROOT/.private/profile.json" 2>/dev/null; then
    echo 'Add to profile JSON:  "resumePath": ".private/resume.pdf"'
  fi
fi
echo "Next: npx cua apply --url \"\$APPLY_URL\" --profile .private/profile.json --plan-json .private/plan.json --headed --escalate"
