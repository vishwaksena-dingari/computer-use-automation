# Skills playbook — project overlay (template)

**This file specializes Agent OS for *this* repo.**  
Universal routers: skill `agent-os` → `references/playbook.md` (or vendored `agent-os/PLAYBOOK.md`).  
Intake: `references/from-prd.md`. Install: `references/tooling.md`.

Replace the sections below after FROM-PRD. Do not weaken intensity caps (no council-everything).

---

## Default posture

1. Decide with intensity (D0–D3); human via grilling when preference/irreversible.  
2. Factory desk before Build (Product → Program Design → Architecture → Vertical Slices). Horizontal design = seams, not layer tickets.  
3. Design before module code — Mermaid + prose with the change.  
4. Build via implementation routing (I0–I4) + named sprints below.  
5. Ponytail = anti-overengineering; intensity caps = anti-overthinking.  
6. Prove with real runs/evidence.  
7. **Companion decide** — always *consider* catalog companions (gstack, graphify, Graft, browser QA, …); *decide* use or skip for this phase. Never run every installed skill every turn. Fill `docs/agents/tooling-ready.md`.  
8. **Dual-skill** — when two similar skills exist for this job (D2+/I2+ or factory/plan/implement), two agents then merge; one actor. Not on I0.  
9. **Vague invoke** — “Agent OS” with no job: one clear next → go (no full list); 2+ live → those options only (`playbook.md`).

---

## Companion tools (optional — always consider)

| Tool | Default | Use when | Skip when |
|---|---|---|---|
| Graft | primary locator if adopted | Orient / find code | Decide-only fog with no code touch |
| gstack | optional / consider | Prove QA, docs factories, team flows | Tiny D0/I0; no evidence need |
| graphify | optional / consider | After substantial `src/` graph refresh | Primary locator already answers; no big src change |
| Addy / Superpowers / Matt | essential (installer) | Dual-skill pairs + factory desk | Already installed; do not re-npx every session |
| Vercel / architect / prod-skills extras | consider later | React stack or heavy architecture ask | Default product work |
| browser / webapp-testing | optional / consider | Real UI evidence | Non-UI sprint |

Project may narrow this table; do not delete companions from the universal catalog.

---

## Phase matrix (fill for this project)

| Phase | Goal | Use these | Do not use |
|---|---|---|---|
| 0 Orient | Read DECISIONS + CONTEXT | — | Coding |
| 1 Decide | Lock fog | wayfinder, grilling, llm-council @ D3 | Feature code |
| 2 Product | Destination / non-goals | grilling; optional idea-refine; **stumped → context + research** (`playbook.md`) | Coding; council of the idea list |
| 3 Program design | Seams + glossary (horizontal design) | domain-modeling, codebase-design | Layer tickets |
| 4 Architecture | Runtime / trust / failure | ARCHITECTURE.md, plan-eng-review | Premature polish |
| 5 Vertical slices | Tracer-bullet tickets | to-tickets; dual planning-and-task-breakdown | Horizontal “schema then UI” stacks |
| 6 Build | Named sprints | ponytail, implement/tdd as needed | Review-everything |
| 7 Prove | Evidence | browser / tests | Fake screenshots |
| 8 Harden | Diff review | ponytail-review; one I4 review | Stacked review theater |
| 9 Write-up | REPORT / README | critic / doc-coauthoring | Inflated claims |

---

## Named delivery sprints (self-descriptive — never “Sprint 1”)

| Sprint id | Name | Done when |
|---|---|---|
| S1 | _Replace-Me-Outcome_ | _criteria_ |

---

## Human confirms pending

- _
