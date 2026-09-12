#!/usr/bin/env bash
# @file Ashby path smoke — local shaped mock by default; live URL via ASHBY_APPLY_URL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p evidence/private capabilities/experiments

if [[ -n "${ASHBY_APPLY_URL:-}" ]]; then
  echo "Live mode: ASHBY_APPLY_URL=$ASHBY_APPLY_URL"
  echo "Configure allowedHosts for that host in a local config overlay, then:"
  echo "  npx cua replay <cap> --mode hybrid --profile fixtures/applicant-profile.json --escalate \\"
  echo "    --base-url <origin> --evidence evidence/private/ashby-live"
  echo "EEO/upload/auth walls → HITL resume. Do not commit private evidence."
  exit 0
fi

echo "Local Ashby-shaped mock (set ASHBY_APPLY_URL for live careers page)"
npx cua invoke apply-ashby-shaped --profile fixtures/applicant-profile.json \
  --evidence evidence/private/ashby-shaped-det
npx cua replay capabilities/apply-ashby-shaped.json --mode hybrid \
  --profile fixtures/applicant-profile-hybrid.json \
  --model "${CUA_DEMO_MODEL:-qwen2.5:1.5b-instruct}" \
  --company-context "Ashby-shaped local demo" \
  --evidence evidence/private/ashby-shaped-hybrid
echo "ashby-shaped ok → evidence/private/"
