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
npx cua import-plan --plan-json fixtures/bridge-alias-plan.json --id bridge-alias-demo >/dev/null

echo "=== apply Co A (fill-only) ===" >&2
OUT="$(npx cua apply --url "http://127.0.0.1:4173/apply-demo/co-a/" \
  --profile fixtures/applicant-profile.json \
  --field-map-id demo-co-a \
  --evidence evidence/private/ci-golden-apply 2>&1)" || true
echo "$OUT" | tail -20
echo "$OUT" | grep -q '"exitCode": 0' || { echo "apply Co A failed" >&2; exit 1; }

echo "=== apply Co A via bridge-alias FieldMap ===" >&2
OUT2="$(npx cua apply --url "http://127.0.0.1:4173/apply-demo/co-a/" \
  --profile fixtures/applicant-profile.json \
  --field-map-id bridge-alias-demo \
  --evidence evidence/private/ci-golden-bridge-alias 2>&1)" || true
echo "$OUT2" | tail -20
echo "$OUT2" | grep -q '"exitCode": 0' || { echo "bridge-alias apply failed" >&2; exit 1; }
# Prove plan seed: receipt includes map-driven keys / literal from bridge-alias-plan
test -f evidence/private/ci-golden-bridge-alias/fill-receipt.json || { echo "missing bridge-alias fill-receipt" >&2; exit 1; }
grep -q 'fullName' evidence/private/ci-golden-bridge-alias/fill-receipt.json || { echo "bridge-alias receipt missing fullName" >&2; exit 1; }
grep -F -q 'Bridge Tester' evidence/private/ci-golden-bridge-alias/fill-receipt.json || { echo "bridge-alias receipt missing plan literal" >&2; exit 1; }
node -e '
const r = JSON.parse(require("fs").readFileSync("evidence/private/ci-golden-bridge-alias/fill-receipt.json","utf8"));
const e = (r.entries||[]).find((x)=>x.key==="whyCompany");
if (!e || e.verified !== true || e.actual !== "Because Bridge works.") {
  console.error("bridge-alias receipt missing verified survey literal");
  process.exit(1);
}
'

echo "=== form outcome pages (static) ===" >&2
# form-outcomes self-check already covers CAPTCHA/CLOSED strings; hit fixtures via curl
curl -sf "http://127.0.0.1:4173/apply-demo/fail-captcha/" | grep -qiE 'recaptcha|captcha' || exit 1
curl -sf "http://127.0.0.1:4173/apply-demo/fail-closed/" | grep -qi 'no longer accepting' || exit 1

echo "=== G1 Co A/B/C ===" >&2
bash "$ROOT/scripts/demo-g1-forms.sh"

echo "=== check:golden ok ===" >&2
