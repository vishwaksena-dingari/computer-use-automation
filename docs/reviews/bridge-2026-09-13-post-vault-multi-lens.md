# Bridge harden + vault adapter review — 2026-09-13 (post `03df9ef`)

**Scope:** `git diff 3b4b49a...HEAD` (commits `8448584`, `03df9ef`).

**Reviews:** multi-lens (7) + mattpocock code-review (Standards + Spec). Multi-model deferred (awaiting model picks).

---

## Consensus findings (2+ lenses)

| Finding | Severity | Disposition |
|---|---|---|
| `import-plan.ts` calls `isOpaqueProfilePath(path, [])` — empty keys means reject-all outside regex; unanswered plan steps (`gender`, `pronouns`, …) abort whole import | **Act on** | Track T-B-24 — skip opaque steps or `_plan.*` them; don’t throw whole plan |
| `--out` uses `realpath: false` / nonexistent leaf under symlink can escape write jail | **Act on** | Track T-B-25 — realpath nearest existing ancestor for writes |
| `copy-vault-private.sh` doesn’t set `resumePath` on copied JSON | **Act on** | Track T-B-26 — rewrite profile resumePath when resume copied |
| Pass-2 `dropShadowedFields` may drop required non-literal if requiredness undetected | **Consider** | Track T-B-27 — never drop `required:true` map rows in pass 2 |
| `workAuth: "Yes"` vs `"Authorized"` vocabulary + sponsorship heuristic on bare `/yes/` | **Consider** | Track T-B-28 — normalize Yes→Authorized; don’t infer sponsorshipNo from workAuth alone when vault set flags |
| `identity.location` object can stringify to `[object Object]` if profilePath is `location` | **Consider** | Track T-B-29 — also set string location or leave object only for getProfilePath city/state |
| `region` missing from opaque allowlist regex | **Consider** | Fold into T-B-24 allowlist fix |
| Optimization | none | **Confirmed** |

## Lone / noted

- Upload ext ban on all file kinds (images) — **Noted** (resume-first product)
- surveyPlan-only plans rejected — **Noted** (document or allow survey-only refine)
- Shallow mutate of `raw.flags` — **Consider** T-B-30 clone flags bag
- Docs WHY / DECISIONS lag — **Noted**
- `jailPath` one-line middle man — **Nit**
- password allowlisted as profilePath — **Consider** deny-list at import (T-B-19 follow-up)

## Code-review summary

- **Standards:** ~2 hard (opaque `[]` contract invert; jailPath middle-man) + judgements on multi-layer resumePath / write jail / pass-2.
- **Spec:** T-B-18 partial (`--out`); P2-B script incomplete on resumePath. T-B-7 correctly still blocked. No scope creep.

**Worst Standards:** import opaque-path empty-keys. **Worst Spec:** `--out` realpath gap.
