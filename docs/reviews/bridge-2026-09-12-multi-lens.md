# Bridge sprint review — 2026-09-12

> **Status:** Mid-body dispositions below are historical. Trust **Close-out** and **Deep review 2026-09-13** sections for current truth (only T-B-7 remains open).

Scope: uncommitted Bridge diff vs `HEAD` (plan→fill wiring).  
Lenses: multi-lens (bug, fixes-needed, architecture, optimization, security, QA, docs) + code-review (standards / spec).

## Bug hunt

| Finding | Disposition |
|---|---|
| Multipage seeded map failed `runFillForm` preflight on off-page requireds (`skipInvisibleRequired` ignored) | **Fixed now** — skip bulk preflight when `skipInvisibleRequired` |
| LLM `mergeFieldMap` replace dropped plan `literal` (`normalizeField` omitted it) | **Fixed now** — preserve prior `literal` on replace; normalize copies `literal` |

## Fixes-needed

| Finding | Disposition |
|---|---|
| Stale “re-bootstrap / no stale requireds” comment | **Fixed now** |
| Post-advance retry used `seedMap` not `workingMap` | **Fixed now** |
| Silent seed load miss | **Fixed now** — ledger detail |
| `bridge-alias-plan.json` unused by golden | **Tracked** T-B-11 |
| PRODUCTIZE “Done when” mock prove not in CI | **Tracked** T-B-11 |
| map destination G1–G11 after G12 | **Fixed now** |
| Vault sponsorship self-check missing assert | **Fixed now** |

## Architecture

| Finding | Disposition |
|---|---|
| Discriminated union for profile vs literal | **Not fixed** — design; out of Bridge ponytail scope |
| Zod PlanJson schema | **Tracked** (fold into T-B-11 / later) |
| Duplicated literal / banner helpers | **Not fixed** — low severity smell |
| ARCHITECTURE.md silent on Bridge | **Tracked** T-B-12 |

## Optimization

| Finding | Disposition |
|---|---|
| Full seeded map × pages → resolveTarget misses (up to ~4s/field) | **Tracked** T-B-8 |

## Security

| Finding | Disposition |
|---|---|
| Plan `literal` + file kind → any in-repo path upload | **Fixed now** — no file literals; fill ignores file literals |
| Unescaped `path`/`name` in CSS attribute selectors | **Fixed now** — `cssAttrQuote` |
| Symlink jail incomplete | **Not fixed** — pre-existing; rare |
| Hostile `successBanner` early match | **Not fixed** — medium; needs design (exact match / length floor) |

## QA

| Finding | Disposition |
|---|---|
| Self-check weak on aliases / survey / file ban | **Fixed now** — strengthened `selfCheckImportPlan` |
| Golden doesn’t import bridge-alias | **Tracked** T-B-11 |

## Documentation

| Finding | Disposition |
|---|---|
| No copy-paste prove for bridge-alias | **Fixed now** — APPLY Bridge notes |
| Vault nested hoist under-documented | **Partial** — APPLY command + G12 note; deeper vault example still thin |

## Standards (code-review)

| Finding | Disposition |
|---|---|
| ARCHITECTURE.md not updated with module change | **Tracked** T-B-12 |
| D7 tension: literals on FieldMap vs “PII only via profile” | **Confirmed intentional** under G12/APPLY — plan answers are operational fill data; treat FieldMaps with literals as private |
| Duplicated literal/banner checks | Judgement — leave |

**Standards count:** 1 hard (ARCHITECTURE) tracked; smells judgement.  
**Worst Standards:** ARCHITECTURE.md silence.

## Spec (code-review)

| Finding | Disposition |
|---|---|
| T-B-6 resume docs / T-B-7 live Ashby still open | **Expected** — still `todo` |
| Mock Done-when not in CI | **Tracked** T-B-11 |
| LLM replace vs G12 gaps-only | **Fixed now** (literal preserved; targets may still replace — acceptable for stuck repair) |
| Sponsorship polarity | **Confirmed correct** vs existing `flags.sponsorshipNo` semantics; assert added |

**Spec count:** open todos are intentional; 1 partial CI prove gap.  
**Worst Spec:** mock `--plan-json` receipt prove not in golden.

## Summary

Fixed in this pass: multipage preflight, literal preservation, CSS escape, file-literal ban, seed miss ledger, retry map, docs/self-check tighten.  
Still open: T-B-6/7 (ops), T-B-8 (page-filter perf), T-B-11 (golden fixture), T-B-12 (ARCHITECTURE).

## Close-out (2026-09-13)

- T-B-8 page-filter: **fixed** (`filterFieldMapToControls`)
- T-B-11 golden bridge-alias: **fixed**
- T-B-12 ARCHITECTURE: **fixed**
- T-B-6 resume docs: **fixed**
- Banner min length 12 + `jailPath` realpath: **fixed**
- T-B-7 live Ashby: still **blocked** (needs URL)

## Deep review 2026-09-13 (close-out)

Scope: full uncommitted Bridge vs HEAD.

### Fixed now (this pass)
- successBanner: **exact** match (not substring OR); length floor ≥12 kept
- Page-filter: **retain fields with `literal`** under label drift; ledger when filter shrinks
- Seed miss ledger: `ok: false` (degraded signal)
- `writeImportedFieldMap` / `--id` / `--out` path jail
- Self-check: literal preserve on merge; filter zero-match + literal retain
- Golden: assert fill-receipt has `fullName` + `Bridge Tester`
- DECISIONS **G12a** D7 carve-out for private literal maps
- gitignore `bridge-alias-demo.json`

### Tracked (not fixed)
- T-B-7 live Ashby (blocked on URL)
- Zod PlanJson schema (design)
- Restrict file profilePath to resumePath only (optional)
- Profile load realpath (parity with jailPath)

### Confirmed correct
- cssAttrQuote, no file literals, realpath upload jail, skipInvisibleRequired preflight, vault sponsorship polarity
