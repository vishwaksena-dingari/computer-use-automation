# Agent OS — portable process for any project

**Start here for install/invoke:** [`SETUP.md`](./SETUP.md)

## Paths (no personal absolute paths)

Use env vars — never hardcode a username or a fixed home subdirectory.

| Variable | Meaning | Example |
|---|---|---|
| `CLAUDE_SKILLS_ROOT` | Your skills **library** repo root (contains `skills/`) | wherever you keep that clone |
| `AGENT_OS_HOME` | This kit’s directory (library or vendored) | `$CLAUDE_SKILLS_ROOT/skills/agent-os` or `<repo>/agent-os` |
| `~/.claude/skills/agent-os` | **Live** Claude Code install | refreshed from the library |

```bash
# optional — put in shell profile
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"
export AGENT_OS_HOME="$CLAUDE_SKILLS_ROOT/skills/agent-os"
```

Scripts discover `AGENT_OS_HOME` from their own location when unset.

## Three independent copies (not linked)

Editing one does **not** change the others until you sync.

| Copy | Role | Customize process here? |
|---|---|---|
| `$CLAUDE_SKILLS_ROOT/skills/agent-os/` | Library original | Yes |
| `~/.claude/skills/agent-os/` | Live Claude install | No — refresh from library |
| `<repo>/agent-os/` | Vendored mirror for Cursor / that repo | No — keep universal; project overlay elsewhere |

```bash
# from library or vendored kit:
bash "$AGENT_OS_HOME/scripts/sync-everywhere.sh"
# requires CLAUDE_SKILLS_ROOT (or script auto-detect when run from library tree)
```

| Invoke | How |
|---|---|
| **Setup (preferred)** | Say `Agent OS: setup this project` → grill Q1–Q8 → Adopt → FROM-PRD |
| **Claude (global)** | `/skills` shows `agent-os` |
| **Cursor / any** | `@agent-os/SETUP.md` |
| **Script only** | `bash "$AGENT_OS_HOME/scripts/adopt-project.sh" /path/to/repo my-slug` |

Project **overlay** (`docs/agents/skills-playbook.md`, `DECISIONS.md`) holds sprints and out-of-scope — not this kit.

## What you get

| Piece | File | Job |
|---|---|---|
| **Setup / invoke** | [`SETUP.md`](./SETUP.md) | Global vs per-project, grilling |
| Adopt / sync | [`scripts/`](./scripts/) | File seeds; library → live |
| PRD / idea | [`FROM-PRD.md`](./FROM-PRD.md) | Intake |
| Build loop | [`PLAYBOOK.md`](./PLAYBOOK.md) | Intensity routers |
| Tools | [`TOOLING.md`](./TOOLING.md) | Install + GitHub links |
| Seeds | [`TEMPLATES/`](./TEMPLATES/) | CONTEXT, DECISIONS, … |
| Bundle map | [`BUNDLE.md`](./BUNDLE.md) | Universal vs project-only |

## Quick start

1. Set `CLAUDE_SKILLS_ROOT` (or rely on script path detection).  
2. `cp -R "$CLAUDE_SKILLS_ROOT/skills/agent-os" ~/.claude/skills/`  
3. Per repo: `bash "$AGENT_OS_HOME/scripts/adopt-project.sh" /path/to/repo my-slug`  
4. Say: *Agent OS: setup this project* (or idea / FROM-PRD intake).

## Agent start order

1. [`SETUP.md`](./SETUP.md) if first time, else [`PLAYBOOK.md`](./PLAYBOOK.md).  
2. No `DECISIONS.md` / map → [`FROM-PRD.md`](./FROM-PRD.md).  
3. Overlay first for sprints/out-of-scope.  
4. Intensity caps.  
5. Grill humans for preference locks.

## Scale rule

| Scale | Bias |
|---|---|
| Tiny | D0–D1, I0–I1; skip council |
| Weekend / greenfield | Full FROM-PRD; named sprints; council only on irreversible forks |
| Long-lived product | Same routers; more tickets; sprint retarget |

## What this is not

- Not a product SDK.  
- Not “council everything.”  
- Not silent install of every host plugin.  
- Not a place for usernames, home paths, or host project names.
