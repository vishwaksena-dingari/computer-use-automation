# Bridge deep review — 2026-09-13

Scope: full uncommitted Bridge sprint + close-out vs `HEAD` (narrow). Last tag `v0.2.0` reference only.

Lenses: bug, fixes-needed, architecture, optimization, security, QA, docs, SRE + code-review Standards/Spec.

## Bug hunt

| Finding | Disposition |
|---|---|
| successBanner substring false-complete | **Fixed now** — exact match for custom banner |
| Page-filter drops literals on label drift | **Fixed now** — always retain fields with `literal` |
| Seed/merge/file-literal/CSS/jail/preflight/vault | Confirmed correct |

## Fixes-needed

| Finding | Disposition |
|---|---|
| G12 “gaps only” vs LLM replace targets | Documented intentional (literal preserved); leave |
| Golden exit-only | **Fixed now** — receipt asserts fullName + Bridge Tester |
| Banner length floor undocumented | **Fixed now** — APPLY + schema JSDoc |
| Stale mid-body review | **Fixed now** — status banner + deep section |
| `_plan.*` / private maps | **Fixed now** — G12a + gitignore generated demo |

## Architecture

| Finding | Disposition |
|---|---|
| Discriminated FieldMapField / Zod PlanJson | **Tracked** T-B-13 |
| Filter fail-open | Intentional bootstrap; literal retain mitigates |

## Optimization

No hotspots worth chasing; page-filter product win confirmed.

## Security

| Finding | Disposition |
|---|---|
| `--id`/`--out` write escape | **Fixed now** — assertSafeFieldMapId + out jail |
| Banner substring | **Fixed now** (exact) |
| In-repo resumePath upload of secrets | **Tracked** T-B-14 (jail is root-bound by design) |
| Profile load without realpath | **Tracked** T-B-14 |
| Claimed cssAttrQuote / no file literals / realpath upload | Confirmed hold |

## QA

| Finding | Disposition |
|---|---|
| merge literal preserve untested | **Fixed now** — selfCheckMergeLiteralPreserve |
| filter zero-match / literal retain | **Fixed now** |
| Golden soft prove | **Fixed now** |

## Docs

| Finding | Disposition |
|---|---|
| Review Summary stale | **Fixed now** |
| Vault example thin | Leave (Partial); not blocking |

## SRE

| Finding | Disposition |
|---|---|
| Seed miss `ok: true` | **Fixed now** — `ok: false` |
| Filter silent | **Fixed now** — ledger when shrinks / fail-open |
| Banner ignore short | Documented |

## Standards

| Finding | Disposition |
|---|---|
| D7 vs FieldMap.literal | **Fixed now** — G12a carve-out |
| Untracked literal FieldMap | **Fixed now** — gitignore bridge-alias-demo |
| Duplicated banner regex | Removed via exact-match rewrite |

**Standards:** 0 remaining hard. Worst was D7/G12 — carved out.

## Spec

| Finding | Disposition |
|---|---|
| T-B-11 fixture untracked | Fixture ready (`fixtures/bridge-alias-plan.json`); commit with Bridge |
| Done-when soft | **Fixed now** — receipt assert + PRODUCTIZE wording |
| T-B-7 blocked | Correct |
| Banner exact | **Fixed now** |

**Spec:** close-out complete except T-B-7. Worst was soft golden — fixed.

## Prove

- `npm run check:forms` PASS
- bridge-alias apply: `exitCode: 0`, receipt `expected: Bridge Tester`
