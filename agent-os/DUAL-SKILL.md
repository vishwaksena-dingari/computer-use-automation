# DUAL-SKILL — two similar skills, one action

When **two (or more) installed skills do the same job**, do not pick one silently
and do not run both in the same agent. Spawn **two agents**, each bound to one
skill. Merge the better of both. **Then** take a single action.

This applies to the factory desk **and** to the existing Plan / Implement
workflows. It does **not** mean two agents write conflicting files.

---

## When to fire

Fire when **all** of these are true:

1. The catalog (below) has a pair for this job.
2. **Both** skills are actually installed (or readable) on this machine.
3. Intensity is at least **D2** or **I2**, **or** you are in a factory stage
   (Product / Program Design / Architecture / Vertical Slices), **or** the
   user named a sprint / plan / implement pass.

**Never fire** on D0 / I0 (tiny reversible edit).  
**Cap:** one dual-pair per phase. Do not fan out every catalog row.

If only one side of a pair is installed, use that one. Print the missing
install line from `tooling.md` — do not block.

---

## Protocol

```text
detect pair → spawn A (skill A only) + spawn B (skill B only) in parallel
           → parent synthesizes
           → one actor takes the action
```

### Agent A / Agent B (children)

Each child:

- Reads **only** its assigned skill + the same brief / DECISIONS / map.
- Produces an artifact in a fixed shape (plan, ticket list, review findings,
  approach — **not** a full implementation unless the parent asked for a
  design-only first slice).
- Does not invoke the sibling skill.
- Does not edit the repo unless the parent said “design-only files”
  (e.g. a scratch plan under `.scratch/`).

### Parent (synthesizer)

1. **Agreements** — keep.
2. **Conflicts** — table them. Preference / naming / irreversible → grilling.
   Technical fork that is expensive → D3 council **once**, then grilling.
3. **Uniques** — keep the ones that pass ponytail (no ceremony).
4. Write the merged artifact (plan, tickets, review notes, approach).
5. **One** implementer (or I4 reviewer) acts on the merge.

### Code (implement)

Default: children propose **approach + first-slice plan**. Parent merges.
**One** agent writes code with ponytail.

Optional at **I3 / I4** only: pstack **arena** (N candidates → judge → graft).
That is dual-*implementation*, not dual-skill. Do not stack arena on every
dual-skill fire.

Addy’s own orchestration rule: personas review in parallel and merge;
they do **not** each implement the feature. Same here.

---

## Pairs (A = already in this OS, B = Addy / Superpowers / other)

| Job | Skill A | Skill B | Merge into |
|---|---|---|---|
| Product interview | grilling / grill-me / grill-with-docs | Addy `interview-me` / `idea-refine`; obra `brainstorming` | `CONTEXT.md` + DECISIONS |
| Spec | FROM-PRD / Matt `to-spec` / gstack `spec` | Addy `spec-driven-development` | `CONTEXT.md` / spec note |
| Plan / tickets | wayfinder + Matt `to-tickets` | Addy `planning-and-task-breakdown`; obra `writing-plans` | named sprints + map |
| Implement | ponytail + Matt `implement` | Addy `incremental-implementation`; obra `executing-plans` | one coding pass |
| TDD | Matt `tdd` | Addy `test-driven-development`; obra `test-driven-development` | red-green on the slice |
| Architecture | `codebase-design` / gstack `plan-eng-review` | Addy `api-and-interface-design` / `documentation-and-adrs` | `docs/ARCHITECTURE.md` + ADRs |
| Deepen a shallow cluster | `improve-codebase-architecture` (survey) | `codebase-design` (shape the pick) | one deepened module + tests through its interface |
| Review (I4) | critic **or** multi-lens **or** Matt `code-review` **or** gstack `/review` | Addy `code-review-and-quality` | one review note — still pick a primary; dual only if user asked |
| Ship | gstack `ship` / `land-and-deploy` | Addy `shipping-and-launch` | launch checklist |
| Observe | gstack `canary` / `health` | Addy `observability-and-instrumentation` | telemetry + watch plan |

**Do not dual** llm-council with itself. Council is already a multi-model merge.

**Do not dual** every I4 review skill. I4 still means pick **one** primary;
add a second only when the user asked or the blast radius is a release.

---

## Plan workflow (existing)

When the user says “plan this” / wayfinder / to-tickets:

1. Intensity check.
2. If the Plan pair is live → Agent A = wayfinder/`to-tickets`, Agent B =
   Addy `planning-and-task-breakdown` or obra `writing-plans`.
3. Merge to the map + overlay sprints.
4. Stop. Do not implement in the same breath unless the user said to.

---

## Implement workflow (existing)

When the user says “implement” / named sprint / I1+:

1. Confirm Vertical Slices (or an existing ticket) exist. If not, run the
   Plan pair first.
2. If the Implement pair is live → Agent A = ponytail+`implement` approach,
   Agent B = Addy `incremental-implementation` (flags, rollback, slice size)
   or obra `executing-plans`.
3. Merge the approach.
4. **One** coding agent. Prove with the playbook rung (I0–I4).

---

## Anti-patterns

| Reject | Why |
|---|---|
| One agent reads both skills and “averages” | Contaminates both processes |
| Two agents commit to the same files | Merge hell; you wanted *info* merge |
| Dual-skill on every keystroke | Intensity caps still win |
| Dual + council + multi-lens + arena on one task | Review theater |
| Dual `code-simplification` with `improve-codebase-architecture` then council the list | Opposite jobs; AFK ranking. Hygiene pass: two lists, human picks one, no council |
| Council the Stumped / next-features idea list | Research + you pick; D3 only if the **picked** direction is irreversible |
| Inventing a third skill’s rules in the merge | Ponytail: drop ceremony |

---

## Missing skills

Continue with the side you have. Tell the human the GitHub + install line
from `tooling.md`. Dual-skill is **optional power**, not a blocker.
