# REPORT § Heterogeneity & multi-tenant (LOCKED outline)

**Status:** Locked via [Lock REPORT narrative for heterogeneity and multi-tenant](../.scratch/computer-use-automation/issues/09-lock-report-heterogeneity-story.md) after council.  
**Design-only** — paste into `REPORT.md` when writing the submission; do not build runtime.

## Forbidden claim

Do **not** claim multi-tenant runtime, desktop automation, or live drift detection is implemented.

## Outline (~150–220 words in final REPORT)

### Surface abstraction
- Capability = recipe (inputs, steps, outcomes). Surface driver = remote control (observe/act).
- Shipped: `surface: "web"` + Playwright a11y driver.
- Reserved: `desktop` / hostile-legacy web = **new driver**, same Capability shape.
- Litmus: deleting “Playwright” must not break the contract story.

### Multi-tenant reuse
- Mock = **Tenant Alpha**.
- Reuse story: same capability `id`/`version` + future **override pack** via reserved `bindings: {}` (locator/timeout/entry remaps only).
- Drift: checkpoint/locator miss → `HARD_FAILURE` (or HITL), not silent LLM replan.
- No second tenant UI in this slice.

### Proof, not promise
- Point at `evidence/01-discovery` (LLM mint) vs `02`/`03` (`llmCalls: 0` fulfill).
- Unit economics: pay LLM once; replay is cheap.

### What we did not build
- Queues, tenant registry, desktop driver, marketplace, settings UI.
