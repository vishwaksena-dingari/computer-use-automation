# PRODUCTIZE — Apply UI engine roadmap

Agent pickup for product work on `main`. Tags `v0.1.0` / `v0.2.0` are frozen snapshots — do not retarget them for features.

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
