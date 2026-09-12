# Computer-use automation

Capability factory: **discover once (LLM) → versioned artifact → deterministic Playwright replay (no LLM)** against a local hostile bank-ish mock.

**Core path:** member-lookup mock — `train` / `run` / evidence `01–03`.  
**Forms stretch:** G1 apply demos — `npm run demo:g1` / `demo:reviewer`.

## Quick start (host)

```bash
./scripts/setup.sh          # npm install + Playwright Chromium + .env
npm run mock                # terminal 1 — http://127.0.0.1:4173/member-lookup/

./scripts/train.sh          # terminal 2 — LLM observes page → emits capability JSON
./scripts/run.sh M-10042    # happy replay → evidence/02-replay-happy
./scripts/run.sh M-99999    # not-found → evidence/03-replay-exception
./scripts/run.sh M-10042 --headed   # watch Chromium

# Stretch: Tenant Beta skin + bindings overlay (same capability)
./scripts/demo-tenant-beta.sh

# Reviewer one-shot: graded happy+exception + G1 Co A/B/C (local mock only)
npm run demo:reviewer

# G1 local forms only (Co A, Co B, Co C hybrid repair — not live ATS):
npm run demo:g1

# Dormant craft (needs Ollama on :11434):
./scripts/demo-craft-ollama.sh

# S9: calling-agent typed invoke (by capability id)
npx cua invoke lookup-member-savings-balance --member-id M-10042

# G1 flags (profile stays out of Capability JSON — PII / reuse):
npx cua replay capabilities/apply-demo-co-a.json \
  --profile fixtures/applicant-profile.json

# Co C: stale map + extra field — hybrid wakes dormant repair (heuristics OK without Ollama):
npx cua replay capabilities/apply-demo-co-c.json \
  --mode hybrid \
  --profile fixtures/applicant-profile-hybrid.json \
  --form-repair-max 3 \
  --evidence evidence/g1-co-c-autonomy-reprove

# Failure-only network/trace (must pair HAR flag with --record-har):
npx cua replay capabilities/apply-demo-co-a.json \
  --profile fixtures/applicant-profile.json \
  --record-har --har-on-failure \
  --trace-on-failure \
  --evidence evidence/g1-co-a-receipt

# G2 stretch: LLM authors steps (writes experiments/; does not touch graded cap)
# npx cua discover --author-steps --goal "Look up member savings balance" \
#   --out capabilities/experiments/authored-capability.json

# Ashby-shaped local ATS path (live: ASHBY_APPLY_URL=… ./scripts/try-ashby.sh)
./scripts/try-ashby.sh

# Optional bounded heals / P3 (off by default):
#   cua replay … --auto-retrain
#   cua replay … --autonomous-repair --autonomous-repair-max 3
#   cua replay … --escalate --hitl-locator-patch
#   cua replay … --escalate --record-actions

# Optional retarget experiment (Sauce Demo) — not the graded mock-core slice:
#   ./scripts/try-sauce.sh
#   ./scripts/try-sauce.sh --bad-login
#   ./scripts/try-sauce.sh --headed
```

Debug breadcrumbs (stderr; stdout stays JSON):

```bash
CUA_LOG=debug ./scripts/run.sh M-10042
./scripts/train.sh --verbose
```

## Docker

```bash
docker compose up mock                 # mock on :4173
docker compose run --rm cua            # discover + happy + exception against compose mock
```

## Docs

- `REPORT.md` — design write-up (graded + §8 G1 stretch)  
- `DECISIONS.md` — locked choices (E6–E9 form policy)  
- `docs/ARCHITECTURE.md` — map; **§10c** = G1 hybrid forms  
- `docs/golden-forms.md` — local vs live regression pack  
- `docs/form-failure-pack.md` — known fail → repair/HITL/outcome  
- `docs/TRAINING.md` — retrain commands + failure behavior  
- `evidence/README.md` — grader bag  

## Safety

Do not commit `.env` or the confidential PDF. Secrets stay in environment only.  
CLI/evidence paths are **repo-relative** (no home-directory leaks).
