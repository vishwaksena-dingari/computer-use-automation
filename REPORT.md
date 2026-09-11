# REPORT — Computer-Use Automation

## 1. Problem framing

Legacy bank-ish UIs are hostile to brittle selectors. This system that turns a natural-language goal into a **reusable capability**, then **replays without an LLM**, distinguishing **business outcomes** (member not found) from hard failures.

## 2. Architecture

CLI `cua` loads runtime config (CLI > env > `config.yaml` > defaults). **Discovery** opens the local mock, observes page text + controls, asks Ollama to emit **locator candidates only** (JSON-Schema constrained), and merges them into a **code-owned Capability skeleton** (Zod fail-closed). **Replay** resolves ranked a11y/css locators with Playwright (`llmCalls: 0` by default), classifies `SUCCESS` | `BUSINESS_OUTCOME` | `HARD_FAILURE`. Opt-in: `--auto-retrain` / `--autonomous-repair` (capped re-discover on `locator_miss`), `--hitl-locator-patch` (note→locator), `--record-actions` (P3 HITL click→locator teach). **`cua invoke <id>`** (S9) is the calling-agent surface: resolve capability by id, validate required inputs, deterministic replay, return a thin JSON view (`status` / `outputs` / `code`). **HITL** pauses the same Playwright session on stuck/policy; `cua escalate resume` continues after the operator fixes the live page. Evidence chapters under `/evidence/` mirror the demo story. Operator wrappers: `./scripts/setup.sh`, `train.sh`, `run.sh`; optional Docker Compose for mock + slice.

## 3. Capability artifact

`capabilities/lookup-member-savings-balance.json` (written by train) declares inputs (`memberId`), outputs (`savingsBalance`), ranked targets, checkpoints, and a `branch` that maps the not-found alert to `member.NOT_FOUND`. Zod validation is fail-closed (`src/artifact/`). Private human backups may live under gitignored `.private/golden-capabilities/` — the app does not auto-load them.

## 4. Deterministic replay

Replay defaults to no LLM (`llmCalls: 0`). Happy path extracts `$12,480.55` for `M-10042`. Exception path returns `ok: true`, `status: BUSINESS_OUTCOME`, `code: member.NOT_FOUND` for `M-99999` (HTTP 200 from mock API; UI `role=alert`). Tenant Beta stretch: same artifact + `capabilities/bindings/tenant-beta.json` against `/member-lookup-beta/`.

## 5. Exceptional / business outcomes

Business detection is **branch-only** (not HTTP status). Hard failures cover locator miss, policy block, and missing success checkpoint. `RECOVERABLE` is reserved in the enum but unused in mock v1.

## 6. Human-in-the-loop

Risky/stuck paths can pause with `intervention.json` + screenshot; `cua escalate resume --run <id>` writes `resume.json` and automation retries after re-observing the live DOM in the same browser context. Human clicks during pause are opaque (not written into the capability).

## 7. Evidence & limits

See `/evidence/01-discovery`, `02-replay-happy`, `03-replay-exception`. Discovery `llmCalls >= 1` when Ollama is reachable; `--allow-offline-seed` requires an **explicit** `--seed` path. Live multi-tenant Workday-class portals and HAR replay are out of scope. Local: `./scripts/setup.sh`, `./scripts/train.sh`, `./scripts/run.sh`, or `npm run demo:slice`. Optional Sauce Demo retarget is an experiment only (`./scripts/try-sauce.sh`) — not the graded slice.
