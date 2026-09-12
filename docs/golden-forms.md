# Golden forms (regression + repair context)

Keep **one working example per family** in-repo. Live boards stay local/gitignored; do not paste third-party project paths here.

## Local one-command (`npm run demo:g1`)

Mock must be up (`npm run mock` or `ensure-mock`). Runs **only** Co A + Co B + Co C:

| Family | Cap | Evidence |
|---|---|---|
| Generic mock | `capabilities/apply-demo-co-a.json` | `evidence/g1-co-a-receipt/` |
| Second tenant mock | `capabilities/apply-demo-co-b.json` | `evidence/g1-co-b-receipt/` |
| Stale/drift mock | `capabilities/apply-demo-co-c.json` (`--mode hybrid --form-repair-max 3`) | `evidence/g1-co-c-autonomy-reprove/` |

`npm run demo:reviewer` = graded member-lookup happy+exception **plus** the three rows above.

## Broader pack (separate commands — not inside `demo:g1`)

| Family | Mock / cap | Evidence / how |
|---|---|---|
| Ashby-shaped | `capabilities/apply-ashby-shaped.json` + `apps/mock-core/apply-demo/ashby-shaped/` | `./scripts/try-ashby.sh` or manual replay |
| Ashby live | `capabilities/apply-ashby-sciemo-auto.json` | `evidence/g1-ashby-sciemo-det0/` (`llmCalls:0`) |
| Lever live | `capabilities/apply-lever-100ms-auto.json` | `evidence/g1-lever-100ms-det0/` |
| Greenhouse live | `capabilities/apply-greenhouse-figma-auto.json` | Live fill-no-submit; boards-api enumHints |
| Workday multipage | `capabilities/apply-workday-shaped-auto.json` | `evidence/g1-workday-shaped-autonomy-reprove/` |
| Workday live scaffold | `capabilities/apply-workday-live-scaffold.json` | `evidence/g1-workday-live-scaffold-prove/` (auth path; gated) |

## Repair / craft context (what to feed the LLM)

When repair wakes, prefer **few-shot from a successful sibling of the same `ats-family`**, not a random form:

1. `capabilities/field-maps/<id>.json` from a green run  
2. Redacted `evidence/*/fill-receipt.json` (expected kinds + profilePaths only)  
3. Optional: truncated observe control list from that green run  

Do **not** feed full HTML, HAR, or other repos. Profile values from the current `--profile` still win.

## Hold-out (generalization)

Keep **≥1 form per family** out of the few-shot set:

| Family | Few-shot sibling | Hold-out |
|---|---|---|
| Generic mock | Co A | **Co B** |
| Ashby | `ashby-sciemo-auto` | second live board (e.g. Ibotta/Teamworks prove) |
| Lever | `lever-100ms-auto` | zaimler / walkme caps |
| Greenhouse | figma auto when green | GumGum / Hasbro prove-queue |
| Workday | shaped-auto | live scaffold (auth-only) |

`loadRepairFewShot` skips when `mapId` matches the sibling (self hold-out).

## Failure pack

See `docs/form-failure-pack.md` — frozen “fails today” cases and whether repair / HITL / outcome code applies.
