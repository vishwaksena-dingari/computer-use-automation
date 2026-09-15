# Tooling readiness inventory (template)

Fill after install. Sources: Agent OS `references/tooling.md`.

## Companion posture (do not skip this section)

Companions in the Agent OS catalog (gstack, graphify, Graft, browser QA, …) are **always
eligible to consider**. They are **not** mandatory every turn.

| Rule | Meaning |
|---|---|
| Consider | At each phase, glance at `skill-catalog.md` / this table — would this tool help *this* task? |
| Decide | Use it, or explicitly skip. Do not run the whole catalog every session. |
| Missing | **Offer, then ask** (`missing.md`). Never only “not available.” Skip → PORTABLE. |
| Primary vs secondary | Prefer one **primary** codebase-memory tool when several overlap (often Graft *or* graphify — lock in Notes). |

Suggested status values: `ready` · `optional / consider` · `missing` · `n/a for this repo`.

---

## Status

| Tool | Status | Where | Notes |
|---|---|---|---|
| Addy agent-skills | | `npx` / ~/.agents/skills | Dual-skill B side |
| obra Superpowers | | `npx` / ~/.agents/skills | writing-plans / executing-plans |
| Wayfinder / Matt skills | | | grilling, to-tickets, implement |
| llm-council | | | D3 only |
| critic / multi-lens-review | | library-copy | I4 — pick **one** |
| ponytail | | | Default anti-overengineering on code |
| pstack | | | Cursor multi-model roles when rigor asked |
| Graft | | | Often **primary** repo context graph; prefer `--no-global` |
| gstack | | | **optional / consider** — QA/docs/team flows; not every sprint |
| graphify | | | **optional / consider** — after substantial `src/`; do not displace primary locator without a lock |
| Extras (Vercel / architect / prod-skills / anthropics) | | `install-essentials.sh --extras` | Only if stack needs them |
| Project LLM / runtime | | | per DECISIONS.md |

## Rebuild / refresh

```bash
graft build          # after src exists
graphify .
```

## Product stack (not agent tooling)

List runtime deps from DECISIONS.md here — separate from agent skills.
