# Computer-Use Automation

Capability-factory CLI: discover → versioned capability → deterministic Playwright replay.

**Start here:** `README.md` (setup + demo) · `REPORT.md` (design) · `evidence/01-discovery` … `03-replay-exception`.  
**Product track (stretch):** Apply UI — `docs/APPLY.md` + `docs/PRODUCTIZE.md` + `docs/agents/map.md`.  
Local scratch (gitignored): `.scratch/`. Hygiene: `docs/REPO-HYGIENE.md`. Locks: `DECISIONS.md`.

## Project docs for agents

| Doc | Use |
|---|---|
| `docs/agents/map.md` | Tracked pickup map |
| `docs/agents/skills-playbook.md` | Phase / sprint routing for this repo |
| `docs/agents/tooling-ready.md` | Install / readiness checklist |
| `docs/ARCHITECTURE.md` | System architecture |
| `DECISIONS.md` | Locked product decisions |

Optional local issues under gitignored `.scratch/`. Triage labels: `docs/agents/triage-labels.md`. Domain: `CONTEXT.md` + `docs/adr/`.

## Build discipline

- Prefer small diffs; reuse existing helpers; no unbounded LLM autonomy (see DECISIONS E6 / G3 rejected).
- After `src/` changes: keep architecture docs accurate when boundaries move.
- **How we work:** `docs/agents/skills-playbook.md`.

## Locked direction (see DECISIONS.md)

Vertical slice: NL goal → LLM discovery → versioned capability artifact → deterministic replay (no LLM) → exceptional business outcome → same-session HITL → `/evidence/` + `REPORT.md`.

Runtime config: default **Ollama**; Anthropic/OpenAI switchable; `.env` + `config.yaml` + CLI + `config set` (non-secrets).

## Design & documentation

- Update `docs/ARCHITECTURE.md` when introducing modules.
- Clear names; `@file` / JSDoc on exported surfaces.
- Do not start feature code until the relevant architecture section exists.
