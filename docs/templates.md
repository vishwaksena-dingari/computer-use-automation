# Capability templates (registry)

Named shells are **documentation + optional `template` field** on Capability JSON — not a second executor.

| Id | Purpose | Example |
|---|---|---|
| `member-lookup` | Graded bank member balance | `lookup-member-savings-balance` |
| `ats-apply-shell` | **Dynamic** navigate → `fillFormFlow` (per-page maps) | `apply-demo-co-*`, authored ATS shells |

## Fixed steps vs dynamic guts

| Layer | Fixed? | What changes per company |
|---|---|---|
| Outer capability steps | Prefer **tiny shell** (navigate / wait / fillFormFlow) | Rarely — authored once via `discover --author-steps` or ATS heuristic |
| Field maps | **Dynamic** | Every page: `observe → repairFieldMap` (≤1 LLM on page 0) |
| Fill + verify + receipt | Deterministic after map | Profile values; `fill-receipt.json` |

Do **not** hand-author 40 click/fill steps per tenant. Prefer:

```bash
cua discover --author-steps --goal "Apply to this job" --out capabilities/experiments/authored-apply.json
```

Apply goals short-circuit to `authorAtsApplyShell` (0 LLM) when Ashby/Lever/Workday/Greenhouse is detected — steps stay `fillFormFlow`; fields stay runtime-authored.

Per-tenant variance: `capabilities/field-maps/` + bindings `entryPath`.  
Drift repair: `--mode hybrid` (see `docs/ARCHITECTURE.md` §10c–10d).
