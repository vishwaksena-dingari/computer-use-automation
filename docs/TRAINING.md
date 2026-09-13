# Training / retrain

## Where goldens live

| Path | Role |
|------|------|
| `capabilities/*.json` | **Live** artifacts — written by train; used by replay |
| `.private/golden-capabilities/` | **Human backup only** — gitignored; app does not auto-read |

## Retrain — mock (core)

```bash
# 1) ensure nothing stale (optional)
rm -f capabilities/lookup-member-savings-balance.json

# 2) train — app observes mock + LLM emits locators → writes JSON
./scripts/train.sh --model llama3.2:3b --verbose

# 3) run
./scripts/run.sh M-10042 --headed
./scripts/run.sh M-99999
```

Offline escape hatch (you explicitly point at private golden — not default):

```bash
./scripts/train.sh --allow-offline-seed --seed .private/golden-capabilities/lookup-member-savings-balance.json
```

## Apply UI (`cua apply` / `import-plan`)

```bash
# Optional: merge live allowlist (gitignored)
cp config.local.example.yaml config.local.yaml

npx cua import-plan --plan-json fixtures/sample-apply-plan.json --id sample-plan-demo

npx cua apply --url http://127.0.0.1:4173/apply-demo/co-a/ \
  --profile fixtures/applicant-profile.json \
  --field-map-id demo-co-a

# Worker flags: --escalate (captcha HITL) · --submit (default off) · --storage-state <path>
# Exit codes: 0 ok · 2 HITL/captcha · 3 closed · 4 unmapped/verify/fail
```

See `docs/PRODUCTIZE.md`.

## Sauce Demo (optional)

There is **no** LLM train path for Sauce yet (discover skeleton is member-lookup).  
Private golden is for your eyes only. To replay Sauce after deleting live JSON you must either:

- re-author / restore a file into `capabilities/sauce-demo-open-inventory.json`, then:
  `./scripts/try-sauce.sh --headed`
- or we add a Sauce discover template later

## If replay fails — does the LLM continue / loop?

**Default: no.** Opt-in bounded heals only:

| Behavior | What happens |
|----------|----------------|
| Discover | Starts **from scratch** each `train` (full observe → emit → save) |
| Replay fail | Stops with `HARD_FAILURE` (or HITL pause if `--escalate`) |
| `--auto-retrain` | On `locator_miss` only: re-discover + rewrite artifact + **one** replay retry (cap 1, max 2 via `--auto-retrain-max`) — logged in `auto-retrain.json` |
| `--autonomous-repair` | P3: same loop with higher cap (default 3, hard max 5) until SUCCESS or budget exhausted |
| `--hitl-locator-patch` | After `escalate resume --note "…"`, one LLM patch of the **stuck target** candidates (not a click transcript); `humanActionsRecorded: false` |
| `--record-actions` | P3: during HITL pause, record operator clicks → merge locator candidates into stuck target (`humanActionsRecorded: true`) |
| Truly infinite loop | **Not implemented** — hard max always |

So: failure → inspect evidence → retrain / HITL / optional capped flags. No infinite self-edit.

## Tenant Beta bindings (S8)

Same capability JSON + overlay remaps entry path and locators:

```bash
./scripts/demo-tenant-beta.sh
# or:
cua replay capabilities/lookup-member-savings-balance.json \
  --bindings capabilities/bindings/tenant-beta.json \
  --member-id M-10042
```

Mock skin: `/member-lookup-beta/` (different labels; same API).
