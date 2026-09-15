# TOOLING — install catalog (with original GitHub links)

Agent OS **owns the pack list** and **installs essentials** when you set up a
machine or say “essentials” at setup grilling. Installing a pack is not
“run every skill.” Intensity caps still win.

**Jobs vs engines:** `references/capabilities.md` (vendored `CAPABILITIES.md`).
Install here; decide dispatch vs fallback there.

**Paths:** `$CLAUDE_SKILLS_ROOT` / `$AGENT_OS_HOME` / `~/.claude/skills/…` —
never a username or a fixed home subdirectory in committed docs.

Machine-readable list (what the installer reads): `scripts/skill-packs.tsv`.

```bash
# essentials (default at setup)
bash "$AGENT_OS_HOME/scripts/install-essentials.sh"

# essentials + consider-later extras
bash "$AGENT_OS_HOME/scripts/install-essentials.sh" --extras

# print catalog / no network
bash "$AGENT_OS_HOME/scripts/install-essentials.sh" --list
bash "$AGENT_OS_HOME/scripts/install-essentials.sh" --dry-run
```

Prefer **repo-local** wiring for Graft (`--no-global`) unless the human asks
for machine-wide hooks.

---

## Essential — Agent OS installs these

`npx skills add <pack> -g -y` unless noted. Library-copy rows need
`$CLAUDE_SKILLS_ROOT/skills/<name>`.

| Pack | Role | GitHub | Install |
|---|---|---|---|
| **addyosmani/agent-skills** | Lifecycle: idea-refine, incremental-implementation, ADRs, CI, observability | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) · [skills.addy.ie](https://skills.addy.ie/skills/) | installer (npx) |
| **obra/superpowers** | Brainstorm, writing-plans, executing-plans | [obra/superpowers](https://github.com/obra/superpowers) | installer (npx) |
| **mattpocock/skills** | Wayfinder, grilling, to-tickets, implement, tdd, domain-modeling | [mattpocock/skills](https://github.com/mattpocock/skills) | installer (npx) |
| **llm-council** | D3 forks only | Method: [karpathy/llm-council](https://github.com/karpathy/llm-council) · skill in the library | installer (library-copy) |
| **critic** | I4 review (pick one) | Library `$CLAUDE_SKILLS_ROOT/skills/critic` | installer (library-copy) |
| **multi-lens-review** | I4 review (pick one) | Library `$CLAUDE_SKILLS_ROOT/skills/multi-lens-review` | installer (library-copy) |
| **project-bootstrapper** | Workspace file scaffold | Library `$CLAUDE_SKILLS_ROOT/skills/project-bootstrapper` | installer (library-copy) |
| **agent-os** (this kit) | Factory + decide + build OS | `$CLAUDE_SKILLS_ROOT/skills/agent-os` | `cp -R` / `sync-everywhere.sh` |

If Claude Code `/skills` still misses Addy after npx:

```text
/plugin marketplace add https://github.com/addyosmani/agent-skills.git
/plugin install agent-skills@addy-agent-skills
```

---

## Companion CLIs — now in essentials (machine CLI only)

| Tool | Role | GitHub | Installer does |
|---|---|---|---|
| **Graft** | Repo context graph | [NanoNets/context-graph-engine](https://github.com/NanoNets/context-graph-engine) | `npm i -g @nanonets/graft` — **not** `graft init` |
| **graphify** | Knowledge graph | [safishamsi/graphify](https://github.com/safishamsi/graphify) | `uv tool install graphifyy` — **not** `graphify .` |

## Host installs — clone into the *host*, never into Agent OS

Do **not** copy gstack or pstack into `skills/agent-os/` or into
`<repo>/agent-os/`. Adopt would then ship those trees into every project,
`sync-everywhere` would freeze a fork, and you would lose official updates.

“I want them everywhere” is three different jobs. Do not smash them into one folder.

| Layer | What “everywhere” means | How |
|---|---|---|
| **Portable packs** (Addy, Superpowers, Matt) | Every host that reads `~/.agents/skills` | Already: `npx skills add … -g` |
| **gstack** | One checkout every harness can `Read` + official host fan-out | Clone → `~/.claude/skills/gstack`, pointer `~/.agents/vendor/gstack`, `./setup --host auto` |
| **pstack files** | Any harness can `Read` arena/architect/how | Installer copies the pstack slice → `~/.agents/vendor/pstack` |
| **pstack runtime** | Cursor Task / worktrees / `/setup-pstack` | Cursor plugin only. Other hosts: `portable.md` |

| Tool | Clone / install *where* | Why not inside Agent OS |
|---|---|---|
| **gstack** | Canonical: `~/.claude/skills/gstack` + `~/.agents/vendor/gstack`. Then `./setup --host auto`. | Adopt would ship the whole virtual-team repo into every product. |
| **pstack** | Machine copy: `~/.agents/vendor/pstack`. Cursor plugin for the runtime. | Same. 47 skills in every repo is a junk drawer. Other hosts finish the job via `portable.md`. |
| **ponytail** | Claude/Cursor plugin marketplace | Hooks + always-on. `npx` / a folder copy misses them. |
| **Agent OS process** | Layer B: `<repo>/agent-os/` + `DECISIONS.md` | This is the host-neutral kit. Any agent that can read markdown can follow it. |

## Companion plugins — print only (`npx skills add` is the wrong installer)

| Tool | Role | GitHub | Install |
|---|---|---|---|
| **ponytail** | Anti-overengineering | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `claude plugin marketplace add DietrichGebert/ponytail` then `claude plugin install ponytail@ponytail` |
| **pstack** | Cursor architect / arena / how | [cursor/plugins → pstack](https://github.com/cursor/plugins/tree/main/pstack) | Files: installer `pstack-vendor` → `~/.agents/vendor/pstack`. Runtime: Cursor `/add-plugin pstack`. Other hosts: `PORTABLE.md` |

---

## Extra / consider later — `install-essentials.sh --extras`

Do **not** install these on every machine. Overlap with essentials is high.
Use when the stack or the human asks.

| Pack | Role | GitHub | Why wait |
|---|---|---|---|
| **vercel-labs/agent-skills** | React / Next / web performance | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Only when that is the product stack |
| **diogoX451/principal-software-architect** | Heavy architecture / ADR / ATAM | [diogoX451/principal-software-architect](https://github.com/diogoX451/principal-software-architect) | Overlaps factory stage 3 + Addy ADRs |
| **hungv47/prod-skills** | System-architecture orchestrator | [hungv47/prod-skills](https://github.com/hungv47/prod-skills) · [skills.sh](https://www.skills.sh/hungv47/prod-skills/system-architecture) | Small / unproven vs Addy + Matt |
| **anthropics/skills** | Official Anthropic pack (frontend-design, docx, …) | [anthropics/skills](https://github.com/anthropics/skills) | Large; many machines already have pieces |

Also useful, not in the installer (host already has them or they are taste packs):

| Pack | GitHub | Note |
|---|---|---|
| find-skills | [vercel-labs/skills](https://github.com/vercel-labs/skills) | Discover more packs |
| caveman | [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | Compress / review style — optional |
| ui-ux-pro-max | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Only if the deliverable *is* UI |
| Ollama | [ollama/ollama](https://github.com/ollama/ollama) | Local models → `DECISIONS.md` |

---

## Quick link list

```
https://github.com/addyosmani/agent-skills
https://github.com/obra/superpowers
https://github.com/mattpocock/skills
https://github.com/karpathy/llm-council
https://github.com/DietrichGebert/ponytail
https://github.com/cursor/plugins/tree/main/pstack
https://github.com/garrytan/gstack
https://github.com/garrytan/gstack/blob/main/docs/skills.md
https://github.com/NanoNets/context-graph-engine
https://github.com/safishamsi/graphify
https://github.com/vercel-labs/agent-skills
https://github.com/diogoX451/principal-software-architect
https://github.com/hungv47/prod-skills
https://github.com/anthropics/skills
https://github.com/vercel-labs/skills
https://github.com/juliusbrussee/caveman
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
https://github.com/ollama/ollama
https://skills.sh/
https://skills.addy.ie/skills/
```

---

## Suggested bootstrap

```bash
export CLAUDE_SKILLS_ROOT="$HOME/path/to/your-skills-library"
export AGENT_OS_HOME="$CLAUDE_SKILLS_ROOT/skills/agent-os"

cp -R "$AGENT_OS_HOME" ~/.claude/skills/agent-os
bash "$AGENT_OS_HOME/scripts/install-essentials.sh"
# later, if needed:
# bash "$AGENT_OS_HOME/scripts/install-essentials.sh" --extras
```

Companion CLIs (printed by the installer; run if you want them):

```bash
npm i -g @nanonets/graft
# gstack: one checkout, then fan-out to every detected host
# git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
# cd ~/.claude/skills/gstack && ./setup --host auto --no-prefix --quiet --no-plan-tune-hooks
# graphify: uv tool install graphifyy && graphify install
```

Per repo:

```bash
cd <repo>
graft init --agents cursor claude -y --no-global   # if using Graft
graft build   # after src exists
graphify .
```

---

## Global skill scan (inventory — not auto-invoke)

```bash
bash "${AGENT_OS_HOME:-$HOME/.claude/skills/agent-os}/scripts/scan-global-skills.sh" \
  docs/agents/skill-inventory.local.md
```

- Output is **project/machine-local** (recommend gitignoring `*.local.md`).
- That file **is the pointer** for any harness: `Read` a listed `SKILL.md`.
- See `references/skill-roots.md` for roots + what pointing cannot execute.
- Agents read it to **suggest 0–3 skills** for the current phase.
- This is **not** “run every skill.” Intensity caps still win.

---

## Companion decide posture

gstack, graphify, Graft, Addy, Superpowers, Matt, and other companions stay
in the catalog for **every** adopted project. Adopt does **not** remove them.

| Rule | Agent behavior |
|---|---|
| Always consider | At orient / prove / after big `src/` changes, ask whether a companion helps |
| Decide use or skip | Do not invoke the full catalog every turn |
| Optional ≠ ignored | Mark `optional / consider` in `docs/agents/tooling-ready.md`, not blank-forever |
| Primary locator | If both Graft and graphify exist, lock which is primary in that file’s Notes |
| Missing | Run `install-essentials.sh` or print the install line from this document |

---

## When tooling is missing

1. Continue with PLAYBOOK (map + DECISIONS + grilling).  
2. Run `install-essentials.sh` (or `--extras`) if the human asked for setup.  
3. Do not block D0/I0 on missing gstack/Graft/graphify.

---

## Project readiness checklist

Copy `TEMPLATES/tooling-ready.md` into `docs/agents/tooling-ready.md` and fill
status. **How** to install stays in this file + `scripts/install-essentials.sh`.
