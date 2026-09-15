# REPORT — Computer-Use Automation

## 1. Architecture

CLI `cua` loads runtime config (CLI > env > gitignored `config.local.yaml` > `config.yaml` > defaults). **Discovery** opens a local hostile bank-ish mock, observes page text + controls, asks the LLM (default Ollama) to emit **locator candidates only** (JSON-Schema constrained), and merges them into a **code-owned Capability skeleton** (Zod fail-closed). **Replay** resolves ranked accessibility/CSS locators with Playwright and does **not** call the LLM for decisions (`llmCalls: 0` by default). Results classify as `SUCCESS` | `BUSINESS_OUTCOME` | `HARD_FAILURE`.

Calling agents use `cua invoke <capabilityId>` with typed params. Same-session **HITL** pauses on stuck/policy; `cua escalate resume` continues after a human fixes the live page. Evidence chapters live under `/evidence/` (apply/live runs default to gitignored `evidence/private/`).

**Trade-off:** discovery is real and bounded; production path is deterministic replay. Opt-in repair/retrain exists but is capped—unbounded autonomy (always-on agent) was rejected. Forms / Apply UI (`cua apply`) are a stretch on the same factory, not the core bank slice—see Cuts.

Demo: `./scripts/setup.sh` → `npm run mock` → `./scripts/train.sh` → `./scripts/run.sh M-10042` / `M-99999`, or `npm run demo:reviewer`.

## 2. Artifact schema

A capability is a typed, versioned JSON artifact (Zod). Example: `capabilities/lookup-member-savings-balance.json`.

It declares: ordered steps/actions; ranked locator candidates per control (role/label/text/css with fallback order); typed inputs (e.g. `memberId`); typed outputs (e.g. `savingsBalance`); checkpoints / success conditions; optional `branch` rules that map UI states to **business outcomes** (not crashes).

**Why this shape:** a calling agent needs a clear contract (params in, outcomes out), and a human reviewer needs to see *what* will be clicked without reading a model transcript. Locators are ranked candidates, not a single brittle selector, so replay can degrade gracefully. Secrets and raw PII never belong in the artifact—profiles stay on the invoke/replay CLI (`--profile`), not inside capability JSON.

## 3. Determinism & error handling

Replay uses only the saved artifact + params. Stable targeting prefers accessibility names/roles, then CSS fallbacks; waits and checkpoints assert expected state rather than assuming a click worked.

**Error taxonomy (deliberate):**
- **Business outcome** — expected for the caller (e.g. `member.NOT_FOUND` for `M-99999`); `ok: true`, distinct `code`, not a crash. Detection is **branch/UI**, not HTTP status alone (mock can return 200 with an alert).
- **Recoverable** — reserved for known interstitial / retry patterns; unused on the v1 mock happy path.
- **Hard failure** — locator miss, policy block, missing success checkpoint; structured detail (step, expected, observed) + evidence (screenshot / optional HAR or trace on failure).

Happy path: `M-10042` → extract `$12,480.55` (`evidence/02-replay-happy`). Exception path: `M-99999` → `member.NOT_FOUND` (`evidence/03-replay-exception`). Discovery evidence: `evidence/01-discovery`.

## 4. Heterogeneity & multi-tenant

**Surface seam:** the capability records *intent* (steps, params, checkpoints, outcomes). Perception/action (DOM, a11y tree, screenshot+coords, OS automation) sits behind a locator/resolve layer. Extending to legacy web or desktop means new resolvers, not a new schema language.

**Multi-tenant:** many institutions share a vendor product with different branding/config. Bindings overlays parameterize host/path/skin (demo: Tenant Beta — same capability + `capabilities/bindings/tenant-beta.json` against `/member-lookup-beta/`). Per-tenant overrides stay outside the core flow; drift is handled by capped re-discover/repair or HITL, not by rewriting the artifact by hand for every tenant. Full multi-tenant plumbing is design-only—not built.

## 5. Escalation & handoff

Stuck / policy / risky paths write `intervention.json` + screenshot and pause the **same** Playwright session (not a fresh browser). A human operates that live page; `cua escalate resume --run <id>` writes `resume.json` and automation retries after re-observing the DOM. Control transfer is explicit: automation owns → pause → human owns → resume signal → automation owns. Human clicks during pause are not auto-written into the capability (opaque teach path exists as opt-in). A full co-browsing console is out of scope; the pause/resume seam is real.

## 6. Safety

Configurable **allowlist** of hosts/routes and action classes; the agent must not navigate or act outside it. Risky/irreversible actions (e.g. live Submit on apply) are off by default and gated (explicit flags / operator GO). Artifacts and default logs **redact** secrets and sensitive values; profiles and storage-state stay gitignored under `.private/` / `config.local.yaml`. Limits: allowlists are only as strong as config; a human on a headed session can still do anything the browser can—HITL is trusted.

## 7. Cuts

**Deliberately thin or out:** always-on LLM agent (rejected); full operator UI; desktop surface implementation; queues/clusters; payment / unbounded live ATS autonomy; merging external job-hunter products into this repo.

**Stretch kept minimal (same factory, not the graded core):** G1 local apply demos (`npm run demo:g1`); optional hybrid craft/repair for forms; product-track `cua apply` documented in `docs/APPLY.md`. Live Ashby/Color apply is **not** submission-complete (required-field / radio honesty still open)—do not treat it as the demo path.

**Next with more time:** stronger required-field observation on forms; freeze craft answers into artifacts for deterministic essay replay; richer recoverable-error catalog on the bank mock; one approved-capability gate for unattended invoke.
