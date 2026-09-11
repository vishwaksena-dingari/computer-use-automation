# Computer-use automation (computer-use automation)

Capability factory: **discover once (LLM) → versioned artifact → deterministic Playwright replay (no LLM)** against a local hostile bank-ish mock.

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

# S9: calling-agent typed invoke (by capability id)
npx cua invoke lookup-member-savings-balance --member-id M-10042

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

- `REPORT.md` — design write-up  
- `DECISIONS.md` — locked choices  
- `docs/ARCHITECTURE.md` — map (incl. packaging + logging)  
- `docs/TRAINING.md` — retrain commands + failure behavior  
- `evidence/README.md` — grader bag  

## Safety

Do not commit `.env` or the confidential PDF. Secrets stay in environment only.  
CLI/evidence paths are **repo-relative** (no home-directory leaks).
