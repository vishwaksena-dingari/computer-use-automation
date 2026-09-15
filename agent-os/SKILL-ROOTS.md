# SKILL ROOTS — point any harness at the folders you already have

You do **not** need a second clone **inside Agent OS**. Hosts do not share one
auto-index. Agent OS names the **directories**. Any agent that can `Read` a
file can open a `SKILL.md` in these roots and follow it.

```text
harness → this file → Read SKILL.md in a root → follow it
                    → if a named tool is missing → capabilities.md fallback
```

Do **not** `cp -R` those trees into Agent OS or into each other.
**Do** clone / copy once onto the machine: `$HOME/.agents/vendor/` (installer:
`pstack-vendor`, `gstack-clone`). Any harness `Read`s from there. If the
`SKILL.md` names a tool this host lacks, `portable.md` is the method.

---

## Roots (use `$HOME`, never a username)

| Root | What is already there (this kind of machine) |
|---|---|
| `$HOME/.claude/skills` | gstack checkout + Agent OS + Claude-linked skills (`review`, `qa`, `browse`, …) |
| `$HOME/.agents/skills` | Addy, Superpowers, other `npx skills add -g` packs — the **shared** index |
| `$HOME/.claude/plugins/cache` | Matt Pocock, ponytail, other Claude plugins (hashed folders) |
| `$HOME/.cursor/plugins/cache` | pstack (`skills/` + `agents/`) |
| `$HOME/.cursor/skills` | gstack Cursor fan-out after `./setup --host cursor` (may be missing until then) |
| `$HOME/.agents/vendor/pstack` | pstack slice (skills + agents) — machine copy, not inside Agent OS |
| `$HOME/.agents/vendor/gstack` | Symlink to the gstack checkout |
| `$HOME/.codex/skills` | Codex-native skills; gstack only after `./setup --host codex` |
| `<repo>/agent-os/` | Layer B process (this kit) |

Regenerate a local list:

```bash
bash "${AGENT_OS_HOME:-$HOME/.claude/skills/agent-os}/scripts/scan-global-skills.sh" \
  docs/agents/skill-inventory.local.md
```

That scan **is** the pointer dump. Gitignore it (`*.local.md`). Do not paste it
into the universal kit.

---

## What pointing gives you

| Kind | Cursor can use Claude’s copy? | Claude can use Cursor’s copy? |
|---|---|---|
| **Process markdown** (Matt, Addy, Superpowers, Agent OS, most gstack playbooks) | **Yes** — `Read` the path, follow the skill | **Yes** — same |
| **gstack binaries** (`$HOME/.claude/skills/gstack/bin/…`) | **Yes** if the agent runs those bash lines | n/a (already home) |
| **pstack `arena` Task + model routing + `/setup-pstack`** | n/a (already home) | **No** — Claude can copy the *method* (N children → merge) with its own Task tool; it does not become the Cursor plugin |
| **Slash-command registration** (`/review`, `/arena`) | Only after that host’s installer | Only after that host’s installer |

So: **pointing = discovery + follow the file.**  
It is not “every host grew every plugin runtime.”

---

## Rule for any harness (Claude, Cursor, Codex, Amp, …)

1. Read this file (or vendored `agent-os/SKILL-ROOTS.md`).
2. If `docs/agents/skill-inventory.local.md` exists, use it to **find** a skill (cap 0–3).
3. `Read` that `SKILL.md` from the root above — do not wait for `/skills` to list it.
4. If the skill names a tool this host lacks → `capabilities.md` fallback. Say so in one line.
5. Intensity caps still win. Pointing is not “run every skill.”

Claude Code and Cursor will **not** auto-index each other’s folders.
You (or Agent OS) have to **name the path**. That is the whole move.

**Neither Claude nor Cursor installed:** those `$HOME/.claude` / `$HOME/.cursor`
rows will be missing. That is fine. The live OS is `<repo>/agent-os/`. Portable
packs still go to `$HOME/.agents/skills`. Missing engines → `capabilities.md`
fallback. See `setup.md` → “No Claude and no Cursor.”
