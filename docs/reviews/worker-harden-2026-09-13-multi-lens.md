# Worker harden review — 2026-09-13 (`fbfca95...5a3cb18`)

**Scope:** commits `1e9f8dd`, `5a3cb18` (T-W-1–7, T-B-26, `apply-live.sh`, `auto-ashby.json`).  
**Reviews:** multi-lens (7) + mattpocock code-review Standards (+ Spec pending in same session). Multi-model deferred (awaiting model picks).

---

## Bug hunt

| Finding | Disposition |
|---|---|
| `submitted` inferred from `--submit && ok`, not observed submit/banner (`main.ts` / `engine.ts`) | **Act on** — track T-W-8 |
| `snapLocationOption` can click wrong city on weak score≥2 (St. Johns→Johnsbury if only distractor) | **Act on** — track T-W-9 (require city token + region, else fail) |
| Auto-persist `auto-ashby` with posting-specific placeholders/UUIDs | **Act on** — track T-W-10 (private cache or per-slug id) |
| Path jail / `[object Object]` guard / zero-fill `fillFormFlow` | **Confirmed correct** |

## Fixes-needed

| Finding | Disposition |
|---|---|
| Tracked `auto-ashby.json` convention break vs per-tenant maps | Fold T-W-10 |
| Empty-fill guard only on `fillFormFlow`, not `fillForm` | **Consider** T-W-11 |
| `apply-live.sh --resume` alone skips resumePath rewrite | **Act on** T-W-12 |
| Dead snap before `snapLocationOption`; city branch global in `snapSelectValue` | **Consider** |
| Duplicate T-B-26 on map (`ready` + `done`) | **Fix now** (docs) |
| Self-checks don’t exercise Johnsbury distractor / engine empty-fill | Fold QA |

## Updates/upgrades

| Finding | Disposition |
|---|---|
| Observed submit state vs flag | Fold T-W-8 |
| ATS open-surface in generic engine | **Noted** (ponytail OK for now) |
| Location semantic type | **Noted** / later |

## Optimization

| Finding | Disposition |
|---|---|
| `openApplyFormSurface` ~9s miss path (6×1.5s waits) | **Consider** T-W-13 (parallel/ shorter) |
| Scorers / format | **Confirmed** irrelevant |

## Security

| Finding | Disposition |
|---|---|
| Family FieldMap auto-persist → PII misbind / cache poison | Fold T-W-10 (**high**) |
| `openApplyFormSurface` no post-click origin check | **Act on** T-W-14 |
| `npx cua` registry confusion if bin missing | **Act on** T-W-15 (`node dist/...`) |
| `file:` URL as baseUrl | **Consider** T-W-16 |
| vault copy perms / non-atomic rewrite | **Consider** |

## QA

| Finding | Disposition |
|---|---|
| Submit claim untested against real click | Fold T-W-8 |
| Location distractor boundaries | Fold T-W-9 |
| Overview open / seed persist / empty-fill e2e | **Tracked** with tickets |

## Documentation

| Finding | Disposition |
|---|---|
| `apply-live.sh` not in Quick paths; `mode` missing from worker.json sample | **Act on** doc polish |
| Duplicate T-B-26 | **Fix now** |

## Standards (code-review)

| Finding | Disposition |
|---|---|
| Auto-persist into tracked dir vs G12a/D7 | Fold T-W-10 |
| `snapSelectValue` doc drift; python3 in bash | **Consider** |
| Duplicated escape / location snap places | **Noted** |

## Spec (code-review)

| Finding | Disposition |
|---|---|
| T-W-7 weak snap / city+region needle vs “type city” docs | Fold T-W-9; align APPLY wording |
| T-W-4 persists any missing mapId, not only `auto-<ats>` | Fold T-W-10 |
| `auto-ashby` LinkedIn UUID rank 1 vs APPLY rank≥3 rule | Fold T-W-10 / fix map ranks |
| T-W-6 `--resume` without profile-from skips rewrite | Fold T-W-12 |
| T-W-5 done without committed evidence | **Noted** (private evidence by design) |
| Duplicate T-B-26 | **Fixed** on map |
| `mode` field = mild scope creep | **Noted** (useful; update APPLY sample) |

---

## Act-on implementation (2026-09-13 later)

| Ticket | Disposition |
|---|---|
| T-W-8 | **Fixed** — `submitConfirmed` on ReplayResult; worker `submitted` requires banner |
| T-W-9 | **Fixed** — `snapLocationOption` returns null without city token; no blind Enter |
| T-W-10 | **Fixed** — seed miss → `.private/field-maps/`; removed tracked `auto-ashby.json` |
| T-W-12 | **Fixed** — apply-live + copy-vault always rewrite resumePath when PDF present |
| T-W-14 | **Fixed** — `openApplyFormSurface` returns blocked on host escape |
| T-W-15 | **Fixed** — `node dist/cli/main.js` (requires build) |
| T-W-11 | **Fixed** (later) — empty-fill guard on single-page `fillForm` |
| T-W-13 | **Fixed** (later) — ≤~2s multi-candidate poll instead of 6×1.5s serial |

Docs: ARCHITECTURE Worker harden + APPLY submit/location/seed updated first.
