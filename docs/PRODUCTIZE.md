# PRODUCTIZE — Apply UI engine roadmap

Agent pickup for product work on `main`. Tags `v0.1.0` / `v0.2.0` are frozen snapshots — do not retarget them for features.

**Operator contract (flags / exit codes / live runbook):** [`docs/APPLY.md`](./APPLY.md)  
**Locks:** `DECISIONS.md` (esp. G1–G11). **Map:** `docs/agents/map.md`. **Hygiene:** `docs/REPO-HYGIENE.md`.

## Goal (done when)

```bash
npx cua apply --url "$APPLY_URL" \
  --profile fixtures/applicant-profile.json \
  --plan-json fixtures/sample-apply-plan.json \
  --headed --escalate
# optional: --submit
```

Fills the apply UI, pauses on captcha in the same session, Submit only with `--submit`, writes under `evidence/private/` (gitignored). Exit codes: `0` ok, `2` HITL waiting, `3` closed, `4` unmapped/verify fail.

## Named sprints — **complete**

### P0 — Hygiene — **done**
### P1 — Live hosts + profile — **done**
### P2 — Plan → FieldMap — **done**
### P3 — Captcha / submit ladder — **done**
### P5 — `cua apply` — **done**
### P4 — Harden selectors — **done**
- [x] Rank policy + about:blank sniff
- [x] Greenhouse boards-api helper already in repair path (`greenhouse-boards.ts`)
### R — Reliability fixtures — **done**
### H — Hardening leftovers — **done**
- [x] Host re-check after navigate redirects
- [x] `resolveUnderRoot` path jail for storageState
### P6 — Maintain — **done**
- [x] Split `replayCapability`: **deferred** (ponytail — not blocking apply; track in review notes)
- [x] Golden mock CI: `npm run check:golden`
- [x] HAR sanitize → private only (auto-delete outside `evidence/private/`)

### G2 cart (parked — G8)

Do **not** start until human unlocks.

## Still never

See `DECISIONS.md` out-of-scope table.

## Prove

```bash
npm run check
npm run check:golden
```

## Bridge sprint — plan → fill (active)

Unblocks workers dropping parallel UI assist: imported FieldMaps must drive fill.

- [x] `fillFormFlow` seeds `repairFieldMap` from loaded FieldMap (not always `null`)
- [x] Import aliases: `title`/`isRequired`/`name` + plan `value` → `literal`
- [x] `surveyPlan[]` merged into FieldMap fields
- [x] Nested vault hoist in `normalizeApplyProfile` (identity/contact/personal/education/answers)
- [x] `successBanner` from map in apply done-check
- [x] `check:golden` portable (`grep`, no `rg`)
- [x] Resume: `scripts/copy-resume-private.sh` + `.private/` path jail
- [x] Survey literals survive heuristic shadowing (`whyCompany` vs `additional`)
- [x] Zod `PlanJson` at import + file fields force `resumePath` / profile realpath
- [x] Review harden: merge file+literal, required-owner shadow, plan path allowlist, upload ext, shared realpath jail
- [ ] Live fill-only prove on real Ashby board

**Done when (mock):** golden `bridge-alias` apply receipt shows plan keys/literal filled (incl. survey). **Done when (live):** T-B-7 Ashby fill-only with flattened `.private` profile.

### Bridge review follow-ups (2026-09-12)

- [x] T-B-8 page-filter seeded maps (perf)
- [x] T-B-11 golden imports `fixtures/bridge-alias-plan.json`
- [x] T-B-12 ARCHITECTURE Bridge section
- [x] T-B-13 Zod PlanJson + file/literal refine
- [x] T-B-14 file `resumePath` + profile realpath
- [x] T-B-15–22 review harden (merge/shadow/jail/allowlist/ext/checks/docs)
- [x] T-B-23 career-data vault adapters (`work_authorization`, location, discipline)
- [ ] T-B-7 live Ashby fill-only (blocked — needs URL)
