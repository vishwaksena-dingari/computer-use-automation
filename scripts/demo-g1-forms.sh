#!/usr/bin/env bash
# G1 mock form demos: Co A (det) + Co B (det) + Co C (hybrid dormant repair).
# Requires mock on :4173 (ensure-mock). Happy path expects llmCalls:0.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

CUA=(node dist/cli/main.js)
# Heuristics-only: skip Ollama timeouts unless CUA_G1_PROVIDER=ollama
PROVIDER="${CUA_G1_PROVIDER:-openai}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-dummy-for-heuristics-only}"

run_one() {
  local label="$1"
  shift
  echo "[g1] $label …" >&2
  local out
  out="$("${CUA[@]}" "$@" 2>/dev/null | tail -n 40)"
  echo "$out" | node -e '
    let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
      const j=JSON.parse(s);
      const ok=j.status==="SUCCESS"||j.ok===true;
      console.log(JSON.stringify({label:process.argv[1],ok,status:j.status,code:j.code,llmCalls:j.llmCalls,evidenceDir:j.evidenceDir},null,2));
      if(!ok) process.exit(1);
    });
  ' "$label"
}

run_one "co-a" replay capabilities/apply-demo-co-a.json \
  --profile fixtures/applicant-profile.json --provider "$PROVIDER" \
  --evidence evidence/g1-co-a-receipt

run_one "co-b" replay capabilities/apply-demo-co-b.json \
  --profile fixtures/applicant-profile.json --provider "$PROVIDER" \
  --evidence evidence/g1-co-b-receipt

run_one "co-c-hybrid" replay capabilities/apply-demo-co-c.json \
  --mode hybrid --profile fixtures/applicant-profile-hybrid.json --provider "$PROVIDER" \
  --evidence evidence/g1-co-c-autonomy-reprove --form-repair-max 3

echo "[g1] demo-g1-forms ok" >&2
