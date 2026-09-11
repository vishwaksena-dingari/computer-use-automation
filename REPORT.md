# REPORT — Computer-Use Automation

## 1. Problem framing

Legacy bank-ish UIs are hostile to brittle selectors. This system that turns a natural-language goal into a **reusable capability**, then **replays without an LLM**, distinguishing **business outcomes** (member not found) from hard failures.

## 2. Architecture

CLI `cua` loads runtime config (CLI > env > `config.yaml` > defaults). **Discovery** observes the local mock, optionally confirms via Ollama, and compiles a versioned Capability JSON. **Replay** resolves ranked a11y/css locators with Playwright, executes steps, and classifies `SUCCESS` | `BUSINESS_OUTCOME` | `HARD_FAILURE`. **HITL** pauses the same Playwright session on stuck/policy and resumes via `cua escalate resume`. Evidence chapters under `/evidence/` mirror the demo story.

## 3. Capability artifact

`capabilities/lookup-member-savings-balance.json` declares inputs (`memberId`), outputs (`savingsBalance`), ranked targets, checkpoints, and a `branch` that maps the not-found alert to `member.NOT_FOUND`. Zod validation is fail-closed (`src/artifact/`).

## 4. Deterministic replay

Replay never calls an LLM (`llmCalls: 0`). Happy path extracts `$12,480.55` for `M-10042`. Exception path returns `ok: true`, `status: BUSINESS_OUTCOME`, `code: member.NOT_FOUND` for `M-99999` (HTTP 200 from mock API; UI `role=alert`).

## 5. Exceptional / business outcomes

Business detection is **branch-only** (not HTTP status). Hard failures cover locator miss, policy block, and missing success checkpoint. `RECOVERABLE` is reserved in the enum but unused in mock v1.

## 6. Human-in-the-loop

Risky/stuck paths can pause with `intervention.json` + screenshot; `cua escalate resume --run <id>` writes `resume.json` and automation retries after re-observing the live DOM in the same browser context.

## 7. Evidence & limits

See `/evidence/01-discovery`, `02-replay-happy`, `03-replay-exception`. Limits: discovery v1 compiles from a locked seed after an Ollama confirm when reachable (`--allow-offline-seed` for offline demos); live multi-tenant Workday-class portals and HAR replay are out of scope. Run locally: `npm run mock` + `npm run demo:slice`.
