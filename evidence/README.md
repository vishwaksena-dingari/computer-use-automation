# Evidence bag

Start with these three chapters.

| Chapter | Story |
|---|---|
| `01-discovery/` | Goal → capability emit (`manifest.json`, `run.json`, screenshots) |
| `02-replay-happy/` | `M-10042` → `SUCCESS` + `savingsBalance` (`llmCalls: 0`) |
| `03-replay-exception/` | `M-99999` → `BUSINESS_OUTCOME` `member.NOT_FOUND` |

Canonical capability: `capabilities/lookup-member-savings-balance.json`.

Live HITL pauses land under `evidence/runs/<runId>/hitl/` (local).
