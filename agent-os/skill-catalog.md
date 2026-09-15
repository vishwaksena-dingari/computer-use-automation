# Skill catalog (when to use what) — universal

Project overlays may narrow this. Intensity caps in `playbook.md` always win (no council-everything).

**Companion decide:** rows below (especially gstack, graphify, Graft, browser QA) are always
*eligible to consider*. Agents decide use **or** skip per phase — never delete these rows from the
universal catalog, and never run every row every turn. Record project status in
`docs/agents/tooling-ready.md`.

**gstack / pstack jobs:** dispatch vs fallback is `references/capabilities.md`
(vendored: `agent-os/CAPABILITIES.md`). This catalog is *when*. That file is *which engine*.

## Process

| Skill / doc | When |
|---|---|
| **agent-os** vague invoke | Bare “Agent OS” / slash, no job — one clear next → go (no list); 2+ live → short list only |
| **agent-os** setup grilling | New repo / adopt |
| **agent-os** FROM-PRD / idea grilling | No trustworthy DECISIONS + map |
| **agent-os** Stumped / next features | Locks exist; human wants features or improvement but has no idea which — context + research (`playbook.md`) |
| **agent-os** factory desk | After intake, before Build — Product / Program / Architecture / Vertical Slices |
| **agent-os** dual-skill | Two similar skills installed for this job (D2+/I2+, factory, plan, implement) |
| **agent-os** install-essentials | Setup / “install the packs” — essentials; `--extras` for consider-later |
| **wayfinder** | Chart or work decision tickets (one active decision ticket unless AFK research) |
| **grilling** / **grill-me** | Preference / irreversible — never answer for the human |
| **domain-modeling** | Glossary / ADR terms shift |
| **llm-council** | D3 only — expensive forks; once per fork |

## Factory desk (before Build)

| Stage | Prefer | Dual pair if both installed |
|---|---|---|
| Product | grilling + CONTEXT | Addy `idea-refine` / `interview-me`; obra `brainstorming` |
| Program design | `codebase-design` + module index (`modules.md`) | Addy `api-and-interface-design`; brownfield: `improve-codebase-architecture` |
| Architecture | fill `ARCHITECTURE.md` + gstack `plan-eng-review` | Addy `documentation-and-adrs`; pstack `architect`; `improve-codebase-architecture` if shallow |
| Vertical slices | Matt `to-tickets` | Addy `planning-and-task-breakdown`; obra `writing-plans` |

Horizontal design is the *seams* from Program + Architecture — not a ticket mode.

## Build

| Skill | When |
|---|---|
| **ponytail** (`full`) | Every coding session |
| Addy **incremental-implementation** | Dual with ponytail+implement on I2+ / named sprint |
| Addy **code-simplification** / Claude Code Simplifier | After a feature works, **inside** the current shape. Hygiene pass at I3: one list of nicks, not a merge with architecture |
| Matt **improve-codebase-architecture** | **Cure** for entropy / ball of mud: survey → HTML report → **human picks one** → grill → ticket. HITL, not AFK. Every couple of days on a fast repo; first on a hard-to-change tree. |
| Matt **codebase-design** | Vocabulary + shape of a deep module; every Program Design pass |
| Matt **setup-ts-deep-modules** | Optional TS: forbid imports that skip the package entry |
| **pstack** `/how` | Gnarly module before coding |
| **pstack** `arena` | Optional I3/I4 dual-*implementation* (not every dual-skill fire) |
| Matt **implement** | Settled ticket / locked design |
| Matt **tdd** | Pure calc / classifiers (dual Addy/obra TDD if installed) |
| Matt **research** | External facts (AFK research tickets). **Required** on Stumped / next features after the context pack; tagged `from-research`, not a lock |
| Matt **prototype** | Cheap artifact before locking UX |

## Prove / write / memory

| Skill | When |
|---|---|
| browser / **webapp-testing** / gstack `/qa` | Real evidence |
| **critic** / **multi-lens-review** / Matt **code-review** / Addy `code-review-and-quality` | I4 — pick **one** primary |
| **doc-coauthoring** / gstack `/document-*` | REPORT / README |
| **graphify** | After substantial `src/` |
| **Graft** | After code exists; prefer `--no-global` init; not for Decide phase |

## Usually skip for core delivery

Design-taste / imagegen / pptx / resume packs unless the deliverable *is* that.
