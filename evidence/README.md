# Evidence bag

Start with these three chapters.

Paths in manifests / results / CLI JSON are **repo-relative** (never absolute home paths).

| Chapter | Story |
|---|---|
| `01-discovery/` | Goal → capability emit (`manifest.json`, `run.json`, screenshots) |
| `02-replay-happy/` | `M-10042` → `SUCCESS` + `savingsBalance` (`llmCalls: 0`) |
| `03-replay-exception/` | `M-99999` → `BUSINESS_OUTCOME` `member.NOT_FOUND` |
| `experiments/tenant-beta*` | S8 optional — same capability + bindings overlay |

Canonical capability: `capabilities/lookup-member-savings-balance.json`.

Live HITL pauses land under `evidence/runs/<runId>/hitl/` (local).
