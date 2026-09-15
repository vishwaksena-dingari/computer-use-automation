# What belongs in Agent OS vs the project

## Bundle into the skill (universal process)

| Asset | Role |
|---|---|
| `references/from-prd.md` | PRD **or idea** → decide intake |
| `references/factory.md` | Product → Program Design → Architecture → Vertical Slices |
| `references/modules.md` | Interface-first deep modules; stop-at-interface rule |
| `references/dual-skill.md` | Two similar skills → two agents → merge → one action |
| `references/capabilities.md` | gstack/pstack jobs: dispatch or portable fallback |
| `references/portable.md` | Host-neutral methods for arena / architect / review |
| `references/skill-roots.md` | Point any harness at installed skill folders |
| `references/playbook.md` | D0–D3 / I0–I4 routers |
| `references/tooling.md` | Install + GitHub links |
| `references/setup.md` | Global vs per-project; setup grilling |
| `references/skill-catalog.md` | When to use which skill (capped) |
| `references/bundle.md` | This file (in skill layout) |
| `assets/templates/CONTEXT.md` | Seed |
| `assets/templates/DECISIONS.md` | Seed (+ design + secrets principles) |
| `assets/templates/CLAUDE.md` | Seed (+ design-first) |
| `assets/templates/map.md` | Wayfinder map seed |
| `assets/templates/wayfinder-ticket.md` | Single ticket file shape |
| `assets/templates/issue-tracker.md` | Local `.scratch/` conventions |
| `assets/templates/domain.md` | CONTEXT + ADRs |
| `assets/templates/triage-labels.md` | Default triage roles |
| `assets/templates/skills-playbook.overlay.md` | Project overlay stub |
| `assets/templates/tooling-ready.md` | Per-repo install checklist |
| `assets/templates/skill-roots.local.md` | Machine skill homes (gitignored) |
| `assets/templates/ARCHITECTURE.stub.md` | Personas + mermaid stub |
| `assets/templates/setup-answers.md` | Setup grilling answers |
| `assets/templates/factory-gate.md` | Per-effort factory stage checklist |
| `assets/templates/modules.md` | Per-repo glossary + module index + seam table + deepening log |
| `assets/templates/module-index.md` | Pointer to `docs/agents/modules.md` |
| `assets/templates/gitignore-snippets.md` | `.env` / Graft `.gitignore`+`.ignore` |
| `scripts/adopt-project.sh` | Copy kit + seeds (`--install` / `--install-extras`) |
| `scripts/sync-everywhere.sh` | Mirror → claude-skills → `~/.claude/skills` |
| `references/missing.md` | Offer table when an engine is missing — ask, don’t stall |
| `scripts/offer-missing.sh` | Probe present vs missing |
| `scripts/skill-packs.tsv` | Pack catalog the installer reads |

## Stay in the project (do **not** generalize into the skill)

| This host-project file (examples) | Why project-only |
|---|---|
| Product contract docs (`docs/*-schema.md`, mock, HITL, evidence, …) | Belong to that product |
| Filled `ARCHITECTURE.md` / overlay / `DECISIONS.md` / `CONTEXT.md` | Locked for that brief |
| `.scratch/<effort>/**` | Wayfinder tickets for that effort |
| Generated Graft hooks with absolute machine paths | From `graft init`, not hand-copied |
| `docs/agents/skill-inventory.local.md` | Machine skill scan — regenerate locally; do not paste full inventory into the universal kit |

### Audit note

Process gaps from a full host-repo walk were folded into templates/references. **No** product contract docs belong in this skill.

**Privacy:** Agent OS copies must not contain usernames, absolute home paths, or host project names. Use `CLAUDE_SKILLS_ROOT` / `AGENT_OS_HOME`.

**Rule:** If deleting the file would break *only this product*, it is not Agent OS. If another repo needs the same *process*, it is Agent OS.

**Do not vendor other people’s products into this kit.** gstack, pstack, ponytail,
Addy, and Matt live in the *host*. Portable packs go to `~/.agents/skills` via
`npx skills add -g`. gstack is one checkout plus `./setup --host auto`. pstack
stays a Cursor plugin. The kit stores **routers + install lines**, not a frozen
clone of those repos.
