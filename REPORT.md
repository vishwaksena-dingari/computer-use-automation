# REPORT — Computer-Use Automation

## 1. Problem framing

Hostile UIs punish brittle selectors. This system turns a natural-language goal into a **reusable capability**, then **replays without an LLM**, distinguishing **business outcomes** (member not found) from hard failures.

## 2. Architecture

CLI `cua` loads runtime config (CLI > env > **`config.local.yaml`** > `config.yaml` > defaults). **Discovery** opens the local mock, observes page text + controls, asks Ollama to emit **locator candidates only** (JSON-Schema constrained), and merges them into a **code-owned Capability skeleton** (Zod fail-closed). **Replay** resolves ranked a11y/css locators with Playwright (`llmCalls: 0` by default), classifies `SUCCESS` | `BUSINESS_OUTCOME` | `HARD_FAILURE`. Opt-in: `--auto-retrain` / `--autonomous-repair` (capped re-discover on `locator_miss`), `--hitl-locator-patch` (note→locator), `--record-actions` (P3 HITL click→locator teach). **`cua invoke <id>`** (S9) is the calling-agent surface. **`cua apply` / `import-plan`** (product track) fill apply UIs with profile + FieldMap; see §9 and `docs/APPLY.md`. **HITL** pauses the same Playwright session on stuck/policy; `cua escalate resume` continues after the operator fixes the live page. Evidence chapters under `/evidence/` mirror the demo story; apply defaults to gitignored `evidence/private/`.

## 3. Capability artifact

`capabilities/lookup-member-savings-balance.json` (written by train) declares inputs (`memberId`), outputs (`savingsBalance`), ranked targets, checkpoints, and a `branch` that maps the not-found alert to `member.NOT_FOUND`. Zod validation is fail-closed (`src/artifact/`). Private human backups may live under gitignored `.private/golden-capabilities/` — the app does not auto-load them.

## 4. Deterministic replay

Replay defaults to no LLM (`llmCalls: 0`). Happy path extracts `$12,480.55` for `M-10042`. Exception path returns `ok: true`, `status: BUSINESS_OUTCOME`, `code: member.NOT_FOUND` for `M-99999` (HTTP 200 from mock API; UI `role=alert`). Tenant Beta stretch: same artifact + `capabilities/bindings/tenant-beta.json` against `/member-lookup-beta/`.

## 5. Exceptional / business outcomes

Business detection is **branch-only** (not HTTP status). Hard failures cover locator miss, policy block, and missing success checkpoint. `RECOVERABLE` is reserved in the enum but unused in mock v1. Form fills reuse the same taxonomy with codes such as `field.UNMAPPED`, `field.VERIFY`, `form.CAPTCHA`, `form.CLOSED` (page text + fill detail); captcha with `--escalate` pauses for HITL.

## 6. Human-in-the-loop

Risky/stuck paths can pause with `intervention.json` + screenshot; `cua escalate resume --run <id>` writes `resume.json` and automation retries after re-observing the live DOM in the same browser context. Human clicks during pause are opaque (not written into the capability).

## 7. Evidence & limits

See `/evidence/01-discovery`, `02-replay-happy`, `03-replay-exception`. Discovery `llmCalls >= 1` when Ollama is reachable; `--allow-offline-seed` requires an **explicit** `--seed` path.

Default form evidence (E7): a11y observe, fill-receipt/verify, `ats-family.json`, run ledger, terminal screenshot. **Opt-in:** `--record-har` + `--har-on-failure` (retain HAR only on fail — avoids huge/PII-heavy network dumps on happy path); `--trace-on-failure` → `trace.zip` on fail. Not default: DOM event firehose, full HTML dumps, happy-path video.

Example (local Co A):

```bash
npx cua replay capabilities/apply-demo-co-a.json \
  --profile fixtures/applicant-profile.json \
  --record-har --har-on-failure --trace-on-failure
```

Local: `./scripts/setup.sh`, `./scripts/train.sh`, `./scripts/run.sh`, or `npm run demo:slice`. **One-shot demo:** `npm run demo:reviewer` (happy+exception + G1 Co A/B/C on the **local mock** — not live ATS). Optional Sauce Demo retarget is an experiment only (`./scripts/try-sauce.sh`) — not the core member-lookup slice.

## 8. Stretch — G1 hybrid forms (natural extension)

Same factory, messier UI: **field-maps + `fillForm` / `fillFormFlow`**, dormant repair/craft (wake only when stuck / empty essay), page-as-judge receipts (E8), Ollama default for craft/repair (E9/C6).

`--profile` is invoke/replay context only (never baked into Capability JSON) so PII stays out of versioned artifacts. `--mode hybrid` matters when the map is stale or essays need craft; Co A/B happy path is deterministic (`llmCalls:0`). `--form-repair-max` caps stuck repair iterations (default 3, hard cap 5).

| Demo | Command / evidence |
|---|---|
| Co A / B deterministic | `npm run demo:g1` → `evidence/g1-co-a-receipt`, `g1-co-b-receipt` |
| Co C stale map + repair | same script → `evidence/g1-co-c-autonomy-reprove` (`llmCalls:0` heuristics) |
| HITL escalate/resume | `evidence/g1-co-c-hitl-smoke` |
| Craft wake (Ollama) | `./scripts/demo-craft-ollama.sh` → `evidence/g1-co-a-craft-dormant` |
| Ashby / Lever live (fill no-submit) | caps under `capabilities/apply-*-auto.json` + matching `evidence/g1-*` (separate from `demo:g1`) |
| Workday multipage mock | `capabilities/apply-workday-shaped-auto.json` |
| Workday live auth scaffold (gated) | `evidence/g1-workday-live-scaffold-prove` — Create Account not auto-run |
| Goldens | `docs/golden-forms.md` |

Does **not** replace the core bank mock. Rejected: always-on LLM agent (G3), merging external job products into this repo.

## 9. Product track — Apply UI engine

Post-tag work on `main` (tags `v0.1.0` / `v0.2.0` stay frozen snapshots). Full operator contract: **`docs/APPLY.md`**.

**Goal:** one worker command fills an apply URL without baking PII into Capability JSON; Submit only with an explicit flag; captcha pauses the same Playwright session.

| Piece | What shipped |
|---|---|
| Config | `config.local.yaml` overlay (gitignored) over `config.yaml`; CLI `--storage-state` |
| Profile | `--profile` + vault aliases (`normalizeApplyProfile`); path jail under repo / `.private/` |
| Plan import | `cua import-plan` → FieldMap; label/`name=` first; UUID css rank ≥3 |
| Worker CLI | `cua apply --url …` → fillFormFlow; default evidence under `evidence/private/` |
| Ladder | `--escalate` for captcha/HITL; `--submit` default **off**; stdout `worker.json` + exit `0/2/3/4` |
| Prove | `npm run check:golden` (mock Co A apply + G1 forms) |

```bash
npx cua apply --url http://127.0.0.1:4173/apply-demo/co-a/ \
  --profile fixtures/applicant-profile.json --field-map-id demo-co-a
```

**Still out of scope:** unbounded repair loops, always-on HAR/video, hunter/queue merge, payment submit, full Workday account-create autonomy. Upstream plan generation stays outside this repo — we only import plan JSON.
