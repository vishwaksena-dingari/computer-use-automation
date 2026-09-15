# CAPABILITIES — gstack / pstack jobs inside Agent OS

Agent OS does **not** vendor those repos. It owns the **job**. The host skill
is an **engine**. If the engine is missing, run the fallback. Do not `cp -R`
gstack or pstack to fake the engine.

```text
need a job → this table → dispatch (host can run it) OR fallback (always)
```

**Dispatch** means: read that skill’s `SKILL.md` and follow it.  
**Fallback** means: stay in Agent OS + Matt / Addy / dual-skill.  
**Never** invent pstack `arena` worktrees or gstack `ship` binaries from a
folder copy.

Intensity caps still win. Installing an engine is not “run it every turn.”

---

## Detect

| Engine | This host can run it when |
|---|---|
| **gstack** | A gstack skill is readable (`~/.claude/skills/gstack`, `~/.cursor/skills/gstack-*`, or host equivalent after `./setup --host auto`). **Any harness may `Read` the Claude checkout** — binaries live there. |
| **pstack** | Cursor plugin **or** `$HOME/.agents/vendor/pstack` (markdown). Runtime (`/arena` Task models) is Cursor-only. Other hosts: Read vendor copy, then `portable.md`. |
| **Portable packs** | Addy / Superpowers / Matt — `Read` `$HOME/.agents/skills` or the plugin-cache path in `skill-roots.md` |

If dispatch is listed and the engine is missing: **`missing.md`** (belongs in /
put here / ask). Skip → `portable.md`. Do not block D0/I0. Never clone into
Agent OS.

---

## Jobs

| Job | When (Agent OS) | Dispatch | Fallback (portable) |
|---|---|---|---|
| **Interrogate product** | Intake / Factory Product | gstack `office-hours` / `plan-ceo-review` | FROM-PRD + grilling |
| **Spec** | Brief → lock | gstack `spec` | FROM-PRD + `CONTEXT.md` |
| **Architect / how** | Factory Program + Architecture; gnarly module | pstack `architect` + `how` (Cursor); gstack `plan-eng-review` | `factory.md` stages 2–3 + `codebase-design` + `modules.md` |
| **Parallel plan** | D2+ / factory / “plan this” | dual-skill pair | two agents, merge, one map |
| **Parallel implement** | I3/I4 only, user asked or shape is load-bearing | pstack `arena` if Cursor plugin live | `portable.md` arena method (host subagents + `.scratch/arena/`). Do not fake Cursor worktrees |
| **Thin code** | I0–I2 | ponytail + Matt `implement` | playbook implement rungs |
| **Review** | I4 / release | gstack `/review` | pick **one**: critic / multi-lens / Matt `code-review` |
| **Prove / QA** | Evidence, not screenshots | gstack `/qa` / `browse` | browser + `webapp-testing` |
| **Ship / land / canary** | Slice to prod | gstack `ship` → `land-and-deploy` → `canary` | Addy `shipping-and-launch` + a checklist. No fake canary |
| **Investigate** | Incident / “why is this broken” | gstack `investigate`; pstack `why` | Decide D1–D2 + notes; no architecture rewrite |
| **Deepen a mud ball** | Brownfield, hard-to-change tree | Matt `improve-codebase-architecture` | `modules.md` HITL (human picks one cluster) |
| **Observe** | After ship | gstack `health` / `canary` | Addy `observability-and-instrumentation` |

---

## What Agent OS will never absorb

| Thing | Why it stays out of the *kit* |
|---|---|
| gstack / pstack git trees | One machine clone under `$HOME/.agents/vendor/` (and gstack’s official checkout). Adopt would ship them into every repo. |
| gstack `bin/`, browse, Playwright | Run from the checkout. Cannot fake in markdown. |
| pstack Task models, `/setup-pstack` | Cursor plugin. Method: `portable.md`. |

Layer B (`<repo>/agent-os/`) carries **this file** + `portable.md` so a
non-Claude agent can still finish the job. A vendor copy next to it is
discovery, not a plugin runtime.

---

## Session rule

1. Name the **job** (left column), not the brand.  
2. If dispatch is live on **this** host → use it.  
3. Else fallback. Say so in one line.  
4. Cap: one dispatched engine per phase unless the user named a second.
