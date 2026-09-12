#!/usr/bin/env bash
# Dormant craft evidence: Co A with empty whyCompany → Ollama crafts once.
# Requires: mock up + Ollama reachable (config.yaml model).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-mock.sh"
npm run build --silent

if ! curl -sf -m 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "[craft] Ollama not reachable at :11434 — skip (install/start ollama to record evidence)" >&2
  exit 0
fi

PROFILE="$ROOT/.scratch/craft-profile-empty-why.json"
mkdir -p "$ROOT/.scratch"
node -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync("fixtures/applicant-profile.json","utf8"));
p.answers=p.answers||{};
p.answers.whyCompany="";
fs.writeFileSync(process.argv[1], JSON.stringify(p,null,2));
' "$PROFILE"

echo "[craft] replaying Co A with empty whyCompany (Ollama craft)…" >&2
out="$(node dist/cli/main.js replay capabilities/apply-demo-co-a.json \
  --mode hybrid \
  --profile "$PROFILE" \
  --provider ollama \
  --evidence evidence/g1-co-a-craft-dormant \
  --form-repair-max 3 2>/dev/null | tail -n 50)" || true

echo "$out" | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
  try {
    const j=JSON.parse(s);
    console.log(JSON.stringify({ok:j.ok,status:j.status,llmCalls:j.llmCalls,evidenceDir:j.evidenceDir},null,2));
    if(j.status!=="SUCCESS") process.exit(1);
    if(!(j.llmCalls>=1)) {
      console.error("[craft] expected llmCalls>=1 (craft wake); got", j.llmCalls);
      process.exit(1);
    }
  } catch(e) { console.error(s); process.exit(1); }
});
'
echo "[craft] evidence/g1-co-a-craft-dormant ok" >&2
