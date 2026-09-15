# FACTORY — pre-build desk (any project)

The lights-on software factory is **not** “plan then implement.”
Intake locks fog. This desk designs the work. Build writes the code.

```text
inputs → PRODUCT → PROGRAM DESIGN → ARCHITECTURE → VERTICAL SLICES → BUILD → PR/prove → PROD
         |________________ pre-build desk (this file) _________________|
```

**Horizontal design is not a fifth ticket mode.** It is the *seams* from
Program Design + Architecture (see `modules.md`). Breaking work into
“schema then API then UI” layers is the failure mode that burns agent runs.
Slice the *product path* vertically.

Skip the whole desk for **D0 + I0** (tiny reversible edit). Skip a stage when its
exit artifact already exists and is trustworthy.

---

## Intensity

| Scale | How much desk |
|---|---|
| Tiny / one-file | Skip; go to I0 |
| Weekend / take-home | Product (short) + Architecture stub filled + 1–3 vertical slices |
| Long-lived product | All four stages; dual-skill pairs on (see `dual-skill.md`) |

Do **not** council every stage. D3 still means *one* expensive fork, once.

---

Load `references/modules.md` at Program Design and on every coding session.
Callers and most agent turns **stop at the interface**. Open the body only
when building that module, a through-interface test failed, or the interface
itself is wrong.

---

## Stage 1 — Product

**Question:** What are we shipping, for whom, and what is out?

| Invoke (pick, don’t stack) | Job |
|---|---|
| FROM-PRD leftovers / idea grilling | Destination, personas, non-goals |
| **Stumped / next features** (`playbook.md`) | Human knows they need improvement or features but has no idea which — **context pack + research**, they pick one direction |
| Matt **grilling** / **grill-me** / **grill-with-docs** | Preference locks |
| Matt **research** | External facts for stumped / AFK research tickets (not a lock) |
| gstack **plan-ceo-review** | Ambition / scope critique of an existing brief |
| Addy **idea-refine** | Divergent/convergent “what should we build” |
| Addy **interview-me** | One-question-at-a-time (only if grilling is missing) |
| obra **brainstorming** | Structured explore when the idea is still mush |

**Dual pair (if both installed):** grilling **vs** interview-me / idea-refine.
Run two agents, merge, lock. See `dual-skill.md`.

**Exit**

- [ ] `CONTEXT.md` destination is **demoable for a named persona** + non-goals
- [ ] Quality bar is **checkable** (reject conditions and/or numeric floor — not a slogan)
- [ ] Human OK on scope
- [ ] Later “Done when” lines must trace here (orphan tech tickets fail Vertical)

---

## Stage 2 — Program design (+ horizontal seams)

**Question:** What are the modules, what does each public surface hide, and
what shared language do we use?

Horizontal design lives *here*: **seams** — not a backlog of layer tickets.
See `references/modules.md`. This stage **does not write feature bodies**.

The first picture (many tiny squares, stray arrows) is the failure mode.
The second (a few large modules, one public surface each) is the target.

| Invoke | Job |
|---|---|
| Matt **codebase-design** | Depth, interface, seam, adapter, deletion test |
| Matt **improve-codebase-architecture** | Brownfield: survey shallow clusters → grill one |
| Matt **domain-modeling** | Glossary / ADR terms |
| pstack **architect** / **how** | Type-level sketches; design-it-twice if the surface is foggy |
| Addy **api-and-interface-design** | Contract-first when the kind *is* HTTP/module API |
| Addy **constraint-driven-development** | Standing quality bar with cost-placed checks |
| Matt **setup-ts-deep-modules** | Optional: forbid imports that skip the entry file |

**Dual pair:** codebase-design **vs** api-and-interface-design.  
Brownfield: improve-codebase-architecture **vs** codebase-design.

**Exit**

- [ ] Module index matches the **filesystem** (`docs/ARCHITECTURE.md` + `docs/agents/modules.md`)
- [ ] Each module has **one interface kind** (function / package / CLI / HTTP / UI / events / port) — not “API” by default
- [ ] Public surface is small; internals are not exported
- [ ] Seam records: owner, kind, errors, adapter count, test stand-in. One adapter ≠ a real port
- [ ] Glossary in `CONTEXT.md` or `docs/adr/` if terms shifted
- [ ] Tests will cross the same seam callers use
- [ ] No feature implementation in this stage

---

## Stage 3 — Architecture

**Question:** How does it run, fail, and get changed?

FROM-PRD’s architecture *stub* is not this stage. Fill `docs/ARCHITECTURE.md`
until a builder can follow it without inventing trust boundaries.

| Invoke | Job |
|---|---|
| Fill `docs/ARCHITECTURE.md` | Runtime, data flow, trust, failure |
| gstack **plan-eng-review** | Locks plan/architecture |
| **archify** | Diagrams when a diagram *is* the deliverable |
| Addy **documentation-and-adrs** | Why-records for sticky choices |
| Matt **improve-codebase-architecture** | Existing-code deepening (brownfield) |

**Dual pair:** plan-eng-review **vs** documentation-and-adrs (or pstack architect).

**Exit**

- [ ] Views a later agent can attack: **context, runtime, trust, data, failure, change**
- [ ] Mermaid (or equivalent) for the slice you will build — not a universe dump
- [ ] Sticky choices have a why-record (context / alternatives / consequences)
- [ ] No “we’ll figure out auth later” on an I2+ surface
- [ ] Architecture heading alone is not enough — the **interface is locked** before feature code

---

## Stage 4 — Vertical slices

**Question:** What is the thinnest demoable path, in order?

| Invoke | Job |
|---|---|
| Matt **to-tickets** / **to-issues** | Tracer-bullet tickets + blockers (required if installed) |
| Addy **planning-and-task-breakdown** | Acceptance-criteria task graph |
| obra **writing-plans** | File-by-file implementation plan |
| Agent OS named sprints | Overlay `docs/agents/skills-playbook.md` |

**Dual pair:** to-tickets **vs** planning-and-task-breakdown / writing-plans.
Merge into **named sprints** + a dependency-ordered ticket list.

**Reject:** horizontal stacks (“do all schema, then all API, then all UI”).

**Exit**

- [ ] Named sprints with user-observable “Done when” (traces to Product)
- [ ] First slice is a **walking skeleton**: process starts + one persona path works
- [ ] That path is a **tracer**: it crosses every locked seam once — not “finish a layer”
- [ ] Blockers listed; parallel slices only when seam records are fully locked
- [ ] Reject sprints named Schema / Platform / Shared Utils as the *work* (those are seams, already designed)

Then enter [`playbook.md`](./playbook.md) implementation routing (I0–I4).

---

## After build (already covered — do not reimplement)

These are **not** new Agent OS modes. Route them:

| Factory box | Route |
|---|---|
| Agentic code review | I4 — pick **one**: critic / multi-lens / Matt code-review / gstack `/review` / Addy `code-review-and-quality` |
| Agentic regression | gstack `/qa`, webapp-testing, browser |
| CI/CD (unit / static / security) | Addy `ci-cd-and-automation` to *author* pipelines; gstack `cso` + ship to *run* them |
| Prod rollout | gstack `ship` → `land-and-deploy` → `canary` |
| Monitoring loop | Addy `observability-and-instrumentation` + gstack `health` / `canary` |
| Human reviews, saves hours | Intensity caps. Human locks preference and cuts scope — not every diff. |

---

## Inputs from the factory diagram

| Incoming | What to do |
|---|---|
| CEO / vision | Product stage + `plan-ceo-review` |
| PM / feature request | Product if new destination; else a wayfinder ticket |
| Engineer idea | Same as PM; do not skip Product on “it’s just a refactor” if behavior changes |
| User complaint / incident | Matt **triage** / gstack **investigate** — may skip Product and enter Decide at D1–D2 |

---

## Session start (desk)

Only after Factory is the **one clear next** (gate unfinished) or they named / picked Factory. Do not open the desk when Build vs Features vs Hygiene are still both live.

1. `DECISIONS.md` + overlay.
2. Which factory stage is unfinished? Do **that one**, not all four.
3. Dual-skill only for the active stage (one pair).
4. Stop the desk when Vertical Slices exit criteria pass — then **Build** if a ticket is waiting (clear next), else offer Build vs next work (short live list).
