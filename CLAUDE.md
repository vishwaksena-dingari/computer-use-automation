# Computer-Use Automation

Computer-Use Automation project for computer-use automation.
Public submission repo. Local planning lives under `.scratch/` (not GitHub Issues).

## Agent OS (portable — any project)

Universal process kit: **`agent-os/`** (point agents here to reuse on other repos).

| Doc | Use |
|---|---|
| `agent-os/SETUP.md` | Setup grilling / adopt / invoke |
| `agent-os/README.md` | Adopt / start order |
| `agent-os/FROM-PRD.md` | PRD or idea → wayfinder → grill → council → lock |
| `agent-os/PLAYBOOK.md` | Decision + implementation intensity |
| `agent-os/TOOLING.md` | Install + GitHub links |
| `agent-os/BUNDLE.md` | What is universal vs this project |

This project’s **overlay** (sprints, phase matrix): `docs/agents/skills-playbook.md`.

## Agent skills

### Skills playbook (what to use when)

Follow `docs/agents/skills-playbook.md` for phase routing (decide → design → build → prove → write-up).  
Install/readiness checklist: `docs/agents/tooling-ready.md` (this repo) + `agent-os/TOOLING.md` (sources).

Do not invent parallel process mid-task. Prefer playbook phases over installing more tools.

### Issue tracker

Issues live as local markdown under `.scratch/` (not GitHub). See `docs/agents/issue-tracker.md`.

### Triage labels

Default roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Build discipline defaults

- Coding sessions: **ponytail** at `full` (project rule `.cursor/rules/ponytail.mdc`).
- High-stakes design forks: **llm-council** then wayfinder ticket answer.
- After `src/` exists: `graft build` and optional `/graphify .`
- Pre-submit (Claude Code): gstack `/review` and `/qa` if useful; Cursor uses playbook + browser tools.
- Local build clock (gitignored): `progress.html` — agents update `#progress-state` when closing a sprint or logging focused hours.
- **How to run agents / branches / commits:** `docs/agents/skills-playbook.md` → section **How we work**.

## Locked direction (see DECISIONS.md)

Vertical slice: NL goal → LLM discovery → versioned capability artifact → deterministic replay (no LLM) → exceptional business outcome → same-session HITL → `/evidence/` + `REPORT.md`.

Runtime config over redeploy: default **Ollama `qwen3.5:9b`**, switchable to Anthropic/OpenAI; `.env` + `config.yaml` + CLI + `config set` (non-secrets).

## Design-first & documentation (mandatory)

- **Before implementing a module:** update `docs/ARCHITECTURE.md` (Mermaid + prose) so user-facing vs internal boundaries stay accurate.
- **Docs and diagrams ship together** with the code change that introduces the module.
- **Naming:** self-explanatory file / class / function / variable names. Prefer clarity over brevity.
- **Docstrings:** `@file` module blurb at top of every source file; JSDoc on every exported function and class (contract + side effects). TypeScript, not Python — same intent as module/function docstrings.
- **Do not start feature code** until the relevant architecture section exists.
