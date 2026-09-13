#!/usr/bin/env bash
# Golden CI — local mock only (P6). No live ATS.
# Usage: npm run check:golden
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Run ./scripts/setup.sh first" >&2
  exit 1
fi

echo "=== unit / contract checks ===" >&2
npm run check

bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

echo "=== import-plan ===" >&2
npx cua import-plan --plan-json fixtures/sample-apply-plan.json --id sample-plan-demo >/dev/null

echo "=== apply Co A (fill-only) ===" >&2
OUT="$(npx cua apply --url "http://127.0.0.1:4173/apply-demo/co-a/" \
  --profile fixtures/applicant-profile.json \
  --field-map-id demo-co-a \
  --evidence evidence/private/ci-golden-apply 2>&1)" || true
echo "$OUT" | tail -20
echo "$OUT" | rg -q '"exitCode": 0' || { echo "apply Co A failed" >&2; exit 1; }

echo "=== form outcome pages (static) ===" >&2
# form-outcomes self-check already covers CAPTCHA/CLOSED strings; hit fixtures via curl
curl -sf "http://127.0.0.1:4173/apply-demo/fail-captcha/" | rg -qi 'recaptcha|captcha' || exit 1
curl -sf "http://127.0.0.1:4173/apply-demo/fail-closed/" | rg -qi 'no longer accepting' || exit 1

echo "=== G1 Co A/B/C ===" >&2
bash "$ROOT/scripts/demo-g1-forms.sh"

echo "=== check:golden ok ===" >&2
