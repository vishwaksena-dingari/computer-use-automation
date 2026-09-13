# Wayfinder map — product track (tracked)

**Destination:** Apply UI engine on `main` per `docs/PRODUCTIZE.md` + `DECISIONS.md` (G1–G12).

**Operator contract:** `docs/APPLY.md`  
**Active sprint:** **Bridge** close-out. Must-fix + review follow-ups done; T-B-7 live Ashby blocked on URL.

## Tickets

| Id | Title | Status | Sprint |
|---|---|---|---|
| T-P0-1 | gitignore local overlay + storageState | `done` | P0 |
| T-P1-1 | `config.local.yaml` merge | `done` | P1 |
| T-P1-2 | Profile + vault adapter | `done` | P1 |
| T-P1-3 | `--storage-state` | `done` | P1 |
| T-P2-1 | `cua import-plan` | `done` | P2 |
| T-P2-2 | Apply capability shell | `done` | P2 |
| T-P3-1 | Captcha escalate + `--submit` + exit codes | `done` | P3 |
| T-P5-1 | `cua apply` | `done` | P5 |
| T-P4-1 | Selector rank + sniff | `done` | P4 |
| T-R-1 | Local CAPTCHA/CLOSED fixtures | `done` | R |
| T-H-1 | Host re-check + path jail | `done` | H |
| T-P6-1 | Golden CI + HAR private | `done` | P6 |
| T-P6-2 | Split replayCapability | `wontfix` (not blocking) | P6 |
| T-G2-1 | Cart / non-apply author-steps | `wontfix` until unlock | G2 |
| T-B-1 | fillFormFlow honors imported FieldMap | `done` | Bridge |
| T-B-2 | Plan aliases + literal values + surveyPlan | `done` | Bridge |
| T-B-3 | Nested vault profile flatten | `done` | Bridge |
| T-B-4 | successBanner in apply done-check | `done` | Bridge |
| T-B-5 | check:golden without rg | `done` | Bridge |
| T-B-6 | Resume outside root (copy/.private) | `done` | Bridge |
| T-B-7 | Live Ashby fill-only smoke | `blocked` (needs URL) | Bridge |
| T-B-8 | Page-filter seeded FieldMap (perf + off-page) | `done` | Bridge |
| T-B-9 | Plan CSS selector hardening + file-literal ban | `done` | Bridge |
| T-B-10 | Preserve literal across LLM replace | `done` | Bridge |
| T-B-11 | Golden/self-check covers bridge-alias fixture | `done` | Bridge |
| T-B-12 | ARCHITECTURE.md Bridge section | `done` | Bridge |
| T-B-13 | Zod PlanJson + FieldMap source union | `todo` | Bridge |
| T-B-14 | Restrict file profilePath + profile realpath | `todo` | Bridge |

## Agent start checklist

1. `DECISIONS.md` → `docs/PRODUCTIZE.md` → this map  
2. Prefer new tickets over reopening done rows  
3. Hygiene before commit (`docs/REPO-HYGIENE.md`)
