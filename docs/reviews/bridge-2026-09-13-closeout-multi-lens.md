# Bridge 8→10 close-out review — 2026-09-13

**Scope:** uncommitted working tree vs `HEAD` (`3b4b49a`), then harden pass implementing T-B-14–22.

**Reviews run:** multi-lens (7 lenses) + mattpocock code-review (Standards + Spec). Multi-model deferred (no model pick).

---

## Dispositions after harden implement

| Id | Finding | Disposition |
|---|---|---|
| T-B-15 | mergeFieldMap re-attach literal onto file | **Fixed** — strip literal + force `resumePath` |
| T-B-16 | Hard-coded resumePath vs nested vault | **Fixed as intentional** — documented resumePath-only |
| T-B-17 | Literal steals required owner | **Fixed** — literals only win over optional owners |
| T-B-14 | Import persists arbitrary file profilePath | **Fixed** — import + schema force `resumePath` |
| T-B-18 | Shared realpath jail | **Fixed** — `resolveUnderRoot(..., {realpath})` on profile/plan-json/out |
| T-B-19 | Plan profilePath vault exfil | **Fixed** — `isOpaqueProfilePath` at import |
| T-B-20 | jailPath any in-repo file | **Fixed** — document extension allowlist |
| T-B-21 | Golden / self-check gaps | **Fixed** — verified survey assert + hostile/file merge checks |
| T-B-22 | Empty plan[] vs fields | **Fixed** — Zod refine + APPLY note |
| — | `hoistBagBag` rename | **Fixed** → `hoistIdentityAliases` |
| — | Full FieldMap discriminated union | **Deferred** (YAGNI; refine suffices) |
| — | Provenance types / typed ApplyProfile | **Deferred** |
| T-B-7 | Live Ashby | **Blocked** (needs URL) |

Optimization lens: no action (confirmed irrelevant).

---

## Code-review axes (pre-harden)

Standards / Spec partials on T-B-14 addressed in this implement pass.
