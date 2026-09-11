# What belongs in Agent OS vs the project

## Bundle into the skill (universal process)

| Asset | Role |
|---|---|
| `references/from-prd.md` | PRD **or idea** → decide intake |
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
| `assets/templates/ARCHITECTURE.stub.md` | Personas + mermaid stub |
| `assets/templates/setup-answers.md` | Setup grilling answers |
| `assets/templates/gitignore-snippets.md` | `.env` / Graft `.gitignore`+`.ignore` |
| `scripts/adopt-project.sh` | Copy kit + seeds |
| `scripts/sync-everywhere.sh` | Mirror → claude-skills → `~/.claude/skills` |

## Stay in the project (do **not** generalize into the skill)

| This host-project file (examples) | Why project-only |
|---|---|
| Product contract docs (`docs/*-schema.md`, mock, HITL, evidence, …) | Belong to that product |
| Filled `ARCHITECTURE.md` / overlay / `DECISIONS.md` / `CONTEXT.md` | Locked for that brief |
| `.scratch/<effort>/**` | Wayfinder tickets for that effort |
| Generated Graft hooks with absolute machine paths | From `graft init`, not hand-copied |

### Audit note

Process gaps from a full host-repo walk were folded into templates/references. **No** product contract docs belong in this skill.

**Privacy:** Agent OS copies must not contain usernames, absolute home paths, or host project names. Use `CLAUDE_SKILLS_ROOT` / `AGENT_OS_HOME`.

**Rule:** If deleting the file would break *only this product*, it is not Agent OS. If another repo needs the same *process*, it is Agent OS.
