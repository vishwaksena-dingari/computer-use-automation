# <Project name> — agent entry

Point agents at **`agent-os/`** (or the global `agent-os` skill).

| Doc | Use |
|---|---|
| `agent-os/SETUP.md` | Setup grilling / adopt |
| `agent-os/FROM-PRD.md` | PRD or idea → decide |
| `agent-os/FACTORY.md` | Product → Program Design → Architecture → Vertical Slices |
| `agent-os/MODULES.md` | Interface-first deep modules; when to open the body |
| `agent-os/DUAL-SKILL.md` | Two similar skills → two agents → merge |
| `agent-os/CAPABILITIES.md` | gstack/pstack jobs: dispatch or fallback |
| `agent-os/PORTABLE.md` | Methods when this host lacks Cursor Task / gstack bins |
| `agent-os/SKILL-ROOTS.md` | Point any harness at folders already installed |
| `agent-os/PLAYBOOK.md` | Decision + implementation intensity |
| `agent-os/TOOLING.md` | Install + GitHub links |
| `agent-os/scripts/install-essentials.sh` | Install essential (+ `--extras`) packs |

Project overlay: `docs/agents/skills-playbook.md`.

## Locked direction

See `DECISIONS.md`.

## Design-first (mandatory)

- Factory desk before Build: Product → Program Design → Architecture → Vertical Slices.
- **Interface before body.** Read the module’s public surface first. Do not load the implementation to decide whether to call it. Open the body only when building that module, a through-interface test failed, or the interface is wrong.
- Filesystem is the map. Exports strangers may import come only from the public entry.
- Update `docs/ARCHITECTURE.md` and `docs/agents/modules.md` before implementing a module.
- Docs and diagrams ship with the code change.
- Self-explanatory names (verb-first functions; no cryptic abbreviations).
- Module `@file` blurb; short docs on exported functions/classes (invariants, errors, not only params).
- Do not start feature code until the interface is locked — an empty architecture heading is not enough.
- Tests cross the same seam callers use.

## Build discipline

- **ponytail** `full` while coding.
- High-stakes forks: llm-council (D3) then grilling.
- After `src/` exists: `graft build` / `graphify .` if those tools are adopted.
- Never commit secrets (`.env`); never invent preference locks.
