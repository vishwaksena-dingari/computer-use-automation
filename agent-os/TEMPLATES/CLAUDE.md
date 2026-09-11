# <Project name> — agent entry

Point agents at **`agent-os/`** (or the global `agent-os` skill).

| Doc | Use |
|---|---|
| `agent-os/SETUP.md` | Setup grilling / adopt |
| `agent-os/FROM-PRD.md` | PRD or idea → decide |
| `agent-os/PLAYBOOK.md` | Decision + implementation intensity |
| `agent-os/TOOLING.md` | Install + GitHub links |

Project overlay: `docs/agents/skills-playbook.md`.

## Locked direction

See `DECISIONS.md`.

## Design-first (mandatory)

- Update `docs/ARCHITECTURE.md` before implementing a module.
- Docs and diagrams ship with the code change.
- Self-explanatory names (verb-first functions; no cryptic abbreviations).
- Module `@file` blurb; short docs on exported functions/classes (contract/why).
- Do not start feature code until the relevant architecture section exists.

## Build discipline

- **ponytail** `full` while coding.
- High-stakes forks: llm-council (D3) then grilling.
- After `src/` exists: `graft build` / `graphify .` if those tools are adopted.
- Never commit secrets (`.env`); never invent preference locks.
