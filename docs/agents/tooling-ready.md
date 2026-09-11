# Tooling readiness inventory

Installed and wired for this project (2026-09-11).  
**Sources + install for any project:** [`agent-os/TOOLING.md`](../../agent-os/TOOLING.md).  
**When to use:** `docs/agents/skills-playbook.md` (overlay) + `agent-os/PLAYBOOK.md`.

## Status

| Tool | Status | Where | Notes |
|---|---|---|---|
| **Wayfinder / Matt Pocock** | Ready | Claude plugin `mattpocock-skills` | Tickets under `.scratch/` |
| **llm-council** | Ready | `~/.claude/skills/llm-council` | High-stakes decisions |
| **ponytail** | Ready | Claude plugin + project `.cursor/rules/ponytail.mdc` | Use `full` while coding; `/ponytail-review` before submit |
| **pstack** | Ready | Cursor plugin + `~/.cursor/rules/pstack-models.mdc` | Multi-model roles configured |
| **graphify** | Ready | CLI `graphify` 0.9.26 + `~/.claude/skills/graphify` | Run `/graphify .` after `src/` exists |
| **gstack** | Ready | `~/.claude/skills/gstack` (setup complete) | Claude Code slash skills: `/review`, `/qa`, `/ship`, `/browse`, … |
| **Graft** | Ready (repo-local) | `graft` CLI 0.18.0 + `.cursor/rules/graft.mdc` + MCP | `--no-global` init; graph empty until code lands; `graft/` gitignored |
| **Ollama** | Ready | Local `qwen3.5:9b` | Default LLM per `DECISIONS.md` |

## Rebuild / refresh commands

```bash
# Graft graph (after writing TypeScript)
graft build

# Graphify knowledge graph
graphify .

# gstack upgrade later
~/.claude/skills/gstack/bin/gstack-upgrade   # or /gstack-upgrade in Claude Code
```

## Not auto-enabled globally

- Graft **global** hooks (`~/.claude/settings.json`) were skipped on purpose (`--no-global`) so your personal Claude settings stay intact. This repo is wired; other repos are not.
- gstack is installed for **Claude Code** hosts. In Cursor, prefer playbook + pstack + Graft MCP; invoke gstack skills when running Claude Code on this machine.

## Product stack (separate from agent tooling)

See `DECISIONS.md`: TypeScript, Playwright, Ollama, Capability JSON, CLI — **not** replaced by any of the above.
