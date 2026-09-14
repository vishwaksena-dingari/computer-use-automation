# Wayfinder map — product track (tracked)

**Destination:** Apply UI engine on `main` per `docs/PRODUCTIZE.md` + `DECISIONS.md` (G1–G12).

**Operator contract:** `docs/APPLY.md`  
**Active sprint:** G2 author-steps prove (scoped) — Apply/Bridge harden complete. Not G3.

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
| T-G2-1 | Cart / non-apply author-steps | `partial` — fixture + self-check + `demo:author-steps`; full cart still parked | G2 |
| T-B-1 | fillFormFlow honors imported FieldMap | `done` | Bridge |
| T-B-2 | Plan aliases + literal values + surveyPlan | `done` | Bridge |
| T-B-3 | Nested vault profile flatten | `done` | Bridge |
| T-B-4 | successBanner in apply done-check | `done` | Bridge |
| T-B-5 | check:golden without rg | `done` | Bridge |
| T-B-6 | Resume outside root (copy/.private) | `done` | Bridge |
| T-B-7 | Live Ashby fill-only smoke | `done` (Maximor `/application`; Overview false-green → T-W-*) | Bridge |
| T-B-8 | Page-filter seeded FieldMap (perf + off-page) | `done` | Bridge |
| T-B-9 | Plan CSS selector hardening + file-literal ban | `done` | Bridge |
| T-B-10 | Preserve literal across LLM replace | `done` | Bridge |
| T-B-11 | Golden/self-check covers bridge-alias fixture | `done` | Bridge |
| T-B-12 | ARCHITECTURE.md Bridge section | `done` | Bridge |
| T-B-13 | Zod PlanJson + FieldMap file/literal refine | `done` | Bridge |
| T-B-14 | Restrict file profilePath + profile realpath | `done` | Bridge |
| T-B-15 | mergeFieldMap drop literal when kind→file | `done` | Bridge |
| T-B-16 | resumePath-only for uploads (documented) | `done` | Bridge |
| T-B-17 | Literal shadow must not steal required owners | `done` | Bridge |
| T-B-18 | Shared realpath jail (profile/plan-json/out) | `done` | Bridge |
| T-B-19 | Plan profilePath allowlist | `done` | Bridge |
| T-B-20 | Upload extension allowlist | `done` | Bridge |
| T-B-21 | Stronger golden + shadow/file self-checks | `done` | Bridge |
| T-B-22 | plan vs fields empty-array docs | `done` | Bridge |
| T-B-23 | career-data vault keys in normalizeApplyProfile | `done` | Bridge |
| T-B-24 | Opaque import empty keys abort whole plan | `done` | Harden |
| T-B-25 | `--out` write jail realpath ancestor | `done` | Harden |
| T-B-26 | `copy-vault-private.sh` rewrite resumePath | `done` | Harden |
| T-B-27 | Pass-2 never drop required:true | `done` | Harden |
| T-B-27b | Drop colliding plan literal when required shares selector | `done` | Harden |
| T-B-28 | workAuth Yes→Authorized vocab | `done` | Harden |
| T-B-28b | Don’t infer sponsorshipNo from bare Authorized/Yes | `done` | Harden |
| T-B-29 | Jail `discover --out` via resolveUnderRoot realpath | `done` | Harden |
| T-B-30 | Jail CLI `--evidence` paths via resolveUnderRoot | `done` | Harden |
| T-W-1 | Location object → display string | `done` | Worker |
| T-W-2 | Refuse SUCCESS when filledKeys empty | `done` | Worker |
| T-W-3 | Overview → Application / Apply click | `done` | Worker |
| T-W-4 | Persist auto-ats map after DOM bootstrap | `done` | Worker |
| T-W-5 | Live re-prove Maximor Overview + /application | `done` | Worker |
| T-W-6 | Optional `apply-live.sh` wrapper | `done` | Worker |
| T-W-7 | Location combobox type city → select | `done` | Worker |
| T-W-8 | Observe submit success before outcome submitted | `done` | Worker |
| T-W-9 | Location snap: require city token (+ region); else fail | `done` | Worker |
| T-W-10 | Auto-ats cache private/per-slug; no tracked family poison | `done` | Worker |
| T-W-11 | Empty-fill guard on single-page fillForm | `done` | Worker |
| T-W-12 | apply-live.sh --resume rewrites resumePath | `done` | Worker |
| T-W-13 | openApplyFormSurface: parallel/short miss path | `done` | Worker |
| T-W-14 | Re-assert origin after Apply click | `done` | Worker |
| T-W-15 | apply-live.sh invoke local CLI not bare npx cua | `done` | Worker |
| T-E-1 | fillFormFlow per-page screenshot gallery | `done` | Evidence |

## Agent start checklist

1. `DECISIONS.md` → `docs/PRODUCTIZE.md` → this map  
2. Prefer new tickets over reopening done rows  
3. Hygiene before commit (`docs/REPO-HYGIENE.md`)
