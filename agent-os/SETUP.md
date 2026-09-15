# SETUP — how to invoke Agent OS

**No personal paths.** Use `CLAUDE_SKILLS_ROOT` / `AGENT_OS_HOME` (see [`README.md`](./README.md)). Never commit usernames or absolute home directories.

Two layers. Do not confuse them.

| Layer | Where | Once per… | What it does |
|---|---|---|---|
| **A. Machine (global)** | Host skill dir (`~/.claude/skills/agent-os`, `~/.agents/skills`, Codex/OpenCode after their setup) | Machine / user account | Slash-command / auto-discovery **if that host exists** |
| **B. Project (local)** | `<repo>/agent-os/` + `docs/agents/` + `DECISIONS.md` | Each repo | The actual OS. Any agent that can `Read` files. **Required if Claude and Cursor are both absent.** |

**No Claude and no Cursor:** Layer B only. That is a supported setup, not a degraded secret.  
**Claude and/or Cursor present:** A for triggers + B for every serious repo.  
**Claude-only tiny task:** A alone can be enough.

## Independence

The kit does not require Claude, Cursor, or any named LLM. Layer B + `PORTABLE.md`
is a full process. Engines (gstack, pstack plugin, Matt) are optional power.
See `SKILL.md` → Independence.

There is **no fully silent auto-setup** of marketplace plugins (ponytail, pstack). Semi-auto: say one phrase → **setup grilling** → Adopt → **install essentials** (includes gstack `--host auto`) → FROM-PRD.

---

## Setup grilling (wayfinder-style — preferred)

Do **not** dump a bash wall first. **Ask, lock, then act**.

### Invoke

> **Agent OS: setup this project**

### Agent rules

1. Ask Q1–Q10 in one batch (or one at a time if required).  
2. **Never answer for the human** on preference rows.  
3. Run `scripts/offer-missing.sh` **before** Q9–Q10 so the human sees present vs MISSING. Never say only “not available.”  
4. After answers → Adopt → install if Q6/Q10 said yes → FROM-PRD if a brief/idea exists.  
5. Record → `.scratch/<slug>/setup-answers.md` + `docs/agents/skill-roots.local.md`.  
6. Skip questions already satisfied.

### Questions

| # | Question | Typical options | Default if “defaults” |
|---|---|---|---|
| Q1 | Host(s)? | **detected** / none (markdown only) / named gstack hosts / digest-only | **detected**; if no Claude/Cursor → **none / Layer B** |
| Q2 | Vendor `agent-os/` (layer B)? | yes / no | **yes** unless this is a Claude-only throwaway |
| Q3 | Scratch slug? | kebab-case | folder basename |
| Q4 | Issue tracker? | local `.scratch/` / GitHub / other | **local markdown** |
| Q5 | Install live skill to `~/.claude/skills/agent-os`? | yes / already done / skip | **skip** if Claude is not installed; else already done if `/skills` lists it |
| Q6 | Companion packs now? | **essentials** / essentials+extras / already done / skip | **essentials** |
| Q7 | Brief? | PRD path / paste / **idea only** / later | idea or PRD both OK |
| Q8 | Start FROM-PRD now? | yes / no | **yes** if Q7 has PRD or idea |
| Q9 | Skill home for clones? | **defaults** (`~/.agents/skills` + `~/.agents/vendor`) / specify a folder / skip | **defaults** — create if missing. **Never** Agent OS |
| Q10 | Install MISSING engines now? | **yes to defaults** / yes to Q9 folder / skip (portable) / pick rows | **yes to defaults** if Q6 is essentials |

### After answers

```text
1. Record setup-answers.md
2. Run offer-missing.sh (show the table; Q9–Q10 already asked against it)
3. Q9 specify → export AGENT_OS_VENDOR / AGENT_OS_SKILLS to that folder; mkdir -p
   Q9 defaults → mkdir -p ~/.agents/skills ~/.agents/vendor
4. Write docs/agents/skill-roots.local.md (gitignored)
5. Q5 yes → cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
6. Q2 yes → adopt-project.sh
7. Q6/Q10 install → bash "$AGENT_OS_HOME/scripts/install-essentials.sh"
   extras if Q6 said so
8. Q8 yes → FROM-PRD.md
```

Agents **run** `offer-missing.sh` at setup, then `install-essentials.sh` when
Q6/Q10 is install — do not only print. Failures are non-blocking. Skip →
`PORTABLE.md`, not a dead stop.

---

## How to invoke

### Claude Code

1. `/skills` → `agent-os`  
2. **Bare invoke** (`playbook.md` Vague invoke): one clear next → go, no full list. 2+ live nexts → those options only.  
3. Named job skips the menu: `Agent OS: setup this project` / `I only have an idea — Agent OS intake` / `run FROM-PRD` / `next features` / `hygiene` / `continue sprint <Name>`

### Cursor / other

1. `Agent OS` (vague → menu) or `Agent OS: setup this project`  
2. Or `@agent-os/SETUP.md`  
3. Or open `$AGENT_OS_HOME/SKILL.md` / `$AGENT_OS_HOME/SETUP.md`

### No Claude and no Cursor

Layer **B is the product**. Do not skip adopt.

1. Copy the kit into the repo: `bash "$AGENT_OS_HOME/scripts/adopt-project.sh" . <slug>`  
2. Point the harness at `agent-os/SETUP.md` (or `AGENTS.md` / whatever that host reads).  
3. Say `Agent OS: setup this project`.  
4. Q5 = skip. Q6 still offers packs. Q9 defaults = `~/.agents/skills` + `~/.agents/vendor` (create). Q10 asks to install MISSING rows.  
5. gstack clone goes to vendor if Claude is absent.  
6. pstack **files** can still land in `~/.agents/vendor/pstack`. The Cursor **plugin** cannot. Skip → `PORTABLE.md`.

They still get: intake, factory, modules, dual-skill, I0–I4, prove-via-browser.  
They do not get: `/arena`, `/review` slash commands, Claude plugin Matt (unless npx landed it in `~/.agents/skills`).

### Profile: “don’t install Claude or Cursor, but I want the skills”

Honor this literally. Do **not** install Claude Code, Cursor, or their plugins.

| Q | Lock |
|---|---|
| Q1 | none / Layer B |
| Q5 | skip |
| Q9 | defaults (`~/.agents/skills` + `~/.agents/vendor`) unless they named a folder |
| Q10 | **yes** — clone/copy **files** into those homes |

Then run `install-essentials.sh`: npx packs, **clone gstack into vendor**, **copy/sparse-clone pstack files into vendor**. Use those `SKILL.md` files + gstack **bins** from this harness. Arena = `PORTABLE.md` (no Cursor Task). Slash commands of Claude/Cursor will not exist; invoke by skill name.

“Full skills” here means **full files + portable jobs**. It does not mean “install Cursor without Cursor.”


### After intake

`Continue with agent-os playbook — sprint <Name>.`

---

## A — Machine setup (once)

```bash
# Set once in your shell profile (pick YOUR library location — not a hardcoded home path)
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"   # folder that contains skills/
export AGENT_OS_HOME="$CLAUDE_SKILLS_ROOT/skills/agent-os"

cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
bash "$AGENT_OS_HOME/scripts/install-essentials.sh"
# later: bash "$AGENT_OS_HOME/scripts/install-essentials.sh" --extras
```

Or run scripts from a checkout; they set `AGENT_OS_HOME` from their own path via `scripts/paths.sh`.

Companion tools + GitHub list: [`TOOLING.md`](./TOOLING.md). Pack table: `scripts/skill-packs.tsv`.

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
| Essential skill packs (Addy / Superpowers / Matt / library copies) | **Yes** — `install-essentials.sh` when Q6=essentials |
| Consider-later extras | Semi — Q6=essentials+extras or `--extras` |
| ponytail / pstack plugin click | Print + offer-missing (ask to install or skip portable) |
| Preference locks | **No** — grilling |
| Council everything | **No** |

---

## Verify

```bash
test -d ~/.claude/skills/agent-os && echo "live skill: OK"
test -f ./agent-os/FROM-PRD.md && echo "vendored: OK"
test -f ./agent-os/FACTORY.md && echo "factory: OK"
test -f ./agent-os/CAPABILITIES.md && echo "capabilities: OK"
test -f ./DECISIONS.md && echo "decisions: OK"
test -f "${AGENT_OS_HOME:-$HOME/.claude/skills/agent-os}/scripts/install-essentials.sh" && echo "installer: OK"
```

---

## Next

[`FROM-PRD.md`](./FROM-PRD.md) · [`PLAYBOOK.md`](./PLAYBOOK.md) · [`TOOLING.md`](./TOOLING.md) · [`BUNDLE.md`](./BUNDLE.md)
