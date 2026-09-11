# Training / retrain

## Where goldens live

| Path | Role |
|------|------|
| `capabilities/*.json` | **Live** artifacts — written by train; used by replay |
| `.private/golden-capabilities/` | **Human backup only** — gitignored; app does not auto-read |

## Retrain — mock (graded)

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

## Sauce Demo (optional)

There is **no** LLM train path for Sauce yet (discover skeleton is member-lookup).  
Private golden is for your eyes only. To replay Sauce after deleting live JSON you must either:

- re-author / restore a file into `capabilities/sauce-demo-open-inventory.json`, then:
  `./scripts/try-sauce.sh --headed`
- or we add a Sauce discover template later

## If replay fails — does the LLM continue / loop?

**No. Not in this build.**

| Behavior | What happens |
|----------|----------------|
| Discover | Starts **from scratch** each `train` (full observe → emit → save) |
| Replay fail | Stops with `HARD_FAILURE` (or HITL pause if `--escalate`) — **does not** auto-fix JSON |
| “How far did it get?” | Check `evidence/.../run.json` ledger (last ok step) — for **you**, not an auto-repair loop |
| Loop until success | **Not implemented** — you re-run `./scripts/train.sh` or fix JSON / use HITL |

So: failure → inspect evidence → **retrain from scratch** or escalate manually. No “resume training from the broken step” loop yet.
