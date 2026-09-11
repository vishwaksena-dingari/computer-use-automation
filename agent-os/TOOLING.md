# TOOLING — install catalog (with original GitHub links)

Agents: install only what the host allows; prefer **repo-local** wiring (`--no-global`) unless the human asks for machine-wide hooks.

**Paths:** use `$CLAUDE_SKILLS_ROOT` / `$AGENT_OS_HOME` / `~/.claude/skills/…` — never a username or a fixed home subdirectory in committed docs.

---

## Core process skills

| Tool | Role | GitHub (canonical) | Install |
|---|---|---|---|
| **Wayfinder** (+ grilling, domain-modeling, implement, tdd, research, code-review, …) | Tickets / map / HITL decide | [mattpocock/skills](https://github.com/mattpocock/skills) | Claude plugin / copy from that repo |
| **llm-council** | High-stakes forks only (D3) | Method: [Karpathy LLM Council](https://github.com/karpathy/llm-council) · local skill under `$CLAUDE_SKILLS_ROOT/skills/llm-council` if you keep a copy | `cp -R "$CLAUDE_SKILLS_ROOT/skills/llm-council" ~/.claude/skills/` |
| **ponytail** | Anti-overengineering | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | Marketplace **or** copy `.cursor/rules/ponytail.mdc` |
| **pstack** | Multi-model roles in Cursor | [cursor/plugins → pstack](https://github.com/cursor/plugins/tree/main/pstack) | Cursor Plugins → setup-pstack |
| **agent-os** (this kit) | PRD → decide → build OS | Your skills library: `$CLAUDE_SKILLS_ROOT/skills/agent-os` (no separate public upstream required) | `cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os` |

---

## Codebase memory / review factories

| Tool | Role | GitHub (canonical) | Install |
|---|---|---|---|
| **gstack** | Claude Code virtual team | [garrytan/gstack](https://github.com/garrytan/gstack) · [docs/skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md) | `git clone` → `./setup --host claude` |
| **Graft** | Repo context graph + MCP | [NanoNets/context-graph-engine](https://github.com/NanoNets/context-graph-engine) | `npm i -g @nanonets/graft` → `graft init … --no-global` |
| **graphify** | Knowledge graph | [safishamsi/graphify](https://github.com/safishamsi/graphify) · PyPI `graphifyy` | `uv tool install graphifyy` → `graphify install` |

---

## Optional prove / write / review

| Tool | Role | GitHub / location | Notes |
|---|---|---|---|
| browser / **webapp-testing** / gstack `/qa` | Evidence | [gstack skills](https://github.com/garrytan/gstack/blob/main/docs/skills.md) | Prove phase |
| **critic** / **multi-lens-review** / **project-bootstrapper** | Review / scaffold | Under `$CLAUDE_SKILLS_ROOT/skills/<name>` if you maintain copies | I4 — pick **one** review skill |
| **humanizer** | Prose | Private/derivative skills stay out of public docs | Optional |
| Matt **code-review** | Diff review | [mattpocock/skills](https://github.com/mattpocock/skills) | Alternate I4 |
| **Ollama** | Local models | [ollama/ollama](https://github.com/ollama/ollama) | Model choice → `DECISIONS.md` |

---

## Quick link list

```
https://github.com/mattpocock/skills
https://github.com/cursor/plugins/tree/main/pstack
https://github.com/DietrichGebert/ponytail
https://github.com/garrytan/gstack
https://github.com/garrytan/gstack/blob/main/docs/skills.md
https://github.com/NanoNets/context-graph-engine
https://github.com/safishamsi/graphify
https://github.com/karpathy/llm-council
https://github.com/ollama/ollama
```

Library paths (portable):

```bash
"$CLAUDE_SKILLS_ROOT/skills/agent-os"
"$CLAUDE_SKILLS_ROOT/skills/llm-council"
# …other skills you keep in that library
~/.claude/skills/agent-os          # live
```

---

## Suggested bootstrap

```bash
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"
export AGENT_OS_HOME="$CLAUDE_SKILLS_ROOT/skills/agent-os"

npm i -g @nanonets/graft
# gstack: clone https://github.com/garrytan/gstack && ./setup --host claude
# graphify: uv tool install graphifyy && graphify install

cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
```

Per repo:

```bash
cd <repo>
graft init --agents cursor claude -y --no-global   # if using Graft
graft build   # after src exists
graphify .
```

---

## When tooling is missing

1. Continue with PLAYBOOK (map + DECISIONS + grilling).  
2. Give the human the GitHub + install line.  
3. Do not block D0/I0 on missing gstack/Graft.

---

## Project readiness checklist

Copy `TEMPLATES/tooling-ready.md` into `docs/agents/tooling-ready.md` and fill status. **How** to install stays in this file.
