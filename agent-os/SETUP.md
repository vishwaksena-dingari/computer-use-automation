# SETUP — how to invoke Agent OS

**No personal paths.** Use `CLAUDE_SKILLS_ROOT` / `AGENT_OS_HOME` (see [`README.md`](./README.md)). Never commit usernames or absolute home directories.

Two layers. Do not confuse them.

| Layer | Where | Once per… | What it does |
|---|---|---|---|
| **A. Machine (global)** | `~/.claude/skills/agent-os` + CLIs/plugins | Machine / user account | Skill **triggers** in Claude Code |
| **B. Project (local)** | `<repo>/agent-os/` + `docs/agents/` + `DECISIONS.md` | Each repo | Files any agent can read without the Claude skill host |

**Recommended:** A always + B for any serious repo (especially Cursor).  
**Claude-only tiny task:** A alone can be enough.

There is **no fully silent auto-setup** of every plugin. Semi-auto: say one phrase → **setup grilling** → Adopt → FROM-PRD.

---

## Setup grilling (wayfinder-style — preferred)

Do **not** dump a bash wall first. **Ask, lock, then act**.

### Invoke

> **Agent OS: setup this project**

### Agent rules

1. Ask Q1–Q8 in one batch (or one at a time if required).  
2. **Never answer for the human** on preference rows.  
3. After answers → Adopt → FROM-PRD if a brief/idea exists.  
4. Record → `.scratch/<slug>/setup-answers.md`.  
5. Skip questions already satisfied.

### Questions

| # | Question | Typical options | Default if “defaults” |
|---|---|---|---|
| Q1 | Host(s)? | Claude Code / Cursor / both | both |
| Q2 | Vendor `agent-os/` (layer B)? | yes / no | **yes** if Cursor or shared repo |
| Q3 | Scratch slug? | kebab-case | folder basename |
| Q4 | Issue tracker? | local `.scratch/` / GitHub / other | **local markdown** |
| Q5 | Install live skill to `~/.claude/skills/agent-os`? | yes / already done / skip | already done if `/skills` lists it |
| Q6 | Companion tools now? | none / from TOOLING | **none** |
| Q7 | Brief? | PRD path / paste / **idea only** / later | idea or PRD both OK |
| Q8 | Start FROM-PRD now? | yes / no | **yes** if Q7 has PRD or idea |

### After answers

```text
1. Record setup-answers.md
2. Q5 yes → print: cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
3. Q2 yes → adopt-project.sh
4. Q6 → TOOLING.md rows only
5. Q8 yes → FROM-PRD.md (idea grilling if no PRD)
```

---

## How to invoke

### Claude Code

1. `/skills` → `agent-os`  
2. Say `Agent OS: setup this project` / `I only have an idea — Agent OS intake` / `run FROM-PRD`

### Cursor / other

1. `Agent OS: setup this project`  
2. Or `@agent-os/SETUP.md`  
3. Or open `$AGENT_OS_HOME/SKILL.md` / `$AGENT_OS_HOME/SETUP.md`

### After intake

`Continue with agent-os playbook — sprint <Name>.`

---

## A — Machine setup (once)

```bash
# Set once in your shell profile (pick YOUR library location — not a hardcoded home path)
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"   # folder that contains skills/
export AGENT_OS_HOME="$CLAUDE_SKILLS_ROOT/skills/agent-os"

cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
# optional: cp -R "$CLAUDE_SKILLS_ROOT/skills/llm-council" ~/.claude/skills/
```

Or run scripts from a checkout; they set `AGENT_OS_HOME` from their own path via `scripts/paths.sh`.

Companion tools: [`TOOLING.md`](./TOOLING.md).

---

## B — Per-project setup

### B1. Script

```bash
REPO=/path/to/your/project
# AGENT_OS_HOME already set, or run from any agent-os/scripts/ directory:
bash "$AGENT_OS_HOME/scripts/adopt-project.sh" "$REPO" my-slug
```

### B1b. Manual

```bash
REPO=/path/to/your/project
cp -R "$AGENT_OS_HOME" "$REPO/agent-os"
# If skill layout (references/ + assets/), prefer adopt-project.sh instead.

SLUG=my-project
mkdir -p "$REPO/.scratch/$SLUG/issues" "$REPO/docs/agents" "$REPO/docs/adr"
T="$REPO/agent-os/TEMPLATES"
cp "$T/CONTEXT.md" "$REPO/CONTEXT.md"
cp "$T/DECISIONS.md" "$REPO/DECISIONS.md"
cp "$T/CLAUDE.md" "$REPO/CLAUDE.md"
cp "$T/map.md" "$REPO/.scratch/$SLUG/map.md"
cp "$T/issue-tracker.md" "$REPO/docs/agents/issue-tracker.md"
cp "$T/triage-labels.md" "$REPO/docs/agents/triage-labels.md"
cp "$T/domain.md" "$REPO/docs/agents/domain.md"
cp "$T/skills-playbook.overlay.md" "$REPO/docs/agents/skills-playbook.md"
cp "$T/tooling-ready.md" "$REPO/docs/agents/tooling-ready.md"
cp "$T/ARCHITECTURE.stub.md" "$REPO/docs/ARCHITECTURE.md"
```

### B2. Semi-auto

> **Agent OS: setup this project**

### B3. Sync library ↔ live

```bash
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"
bash "$AGENT_OS_HOME/scripts/sync-everywhere.sh"
```

---

## Automatic vs not

| Step | Auto? |
|---|---|
| Skill trigger | Yes (Claude, if installed) |
| Template adopt | Semi |
| Install Matt / gstack / Graft | **No** — human |
| Preference locks | **No** — grilling |
| Council everything | **No** |

---

## Verify

```bash
test -d ~/.claude/skills/agent-os && echo "live skill: OK"
test -f ./agent-os/FROM-PRD.md && echo "vendored: OK"
test -f ./DECISIONS.md && echo "decisions: OK"
```

---

## Next

[`FROM-PRD.md`](./FROM-PRD.md) · [`PLAYBOOK.md`](./PLAYBOOK.md) · [`TOOLING.md`](./TOOLING.md) · [`BUNDLE.md`](./BUNDLE.md)
