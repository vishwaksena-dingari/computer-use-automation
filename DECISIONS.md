# Decision Sheet — Computer-Use Automation

≤2 pages. Core locks 2026-09-11; product locks 2026-09-12. Edit here; do not expand into a PRD.

## Destination

**Now:** Apply UI engine — discover/import → versioned Capability + FieldMap → deterministic Playwright fill/replay → same-session HITL → receipts under `/evidence/` (private live runs gitignored).

**Baseline kept:** local hostile member-lookup mock (`v0.1.0` tag) + G1 form stretch (`v0.2.0` tag). Tags freeze snapshots; `main` continues.

Not: hunter/queue product, payment checkout, unbounded repair loops, SaaS multi-tenant runtime.

## Locked choices (core)

| # | Decision | Choice | Why |
|---|---|---|---|
| A1 | Root agent file | `CLAUDE.md` | Single entry for agents |
| B1 | Done shape | Vertical slice + form stretch | Demoable without product sprawl |
| B3 | Planning | Tracked map: `docs/agents/map.md`; local scratch gitignored | Agents on clone need a map; secrets stay local |
| C2 | Proxy target | Local hostile mock + Playwright | Deterministic prove without live deps |
| C4 | Computer-use | Playwright + a11y roles/names | Stable locators; screenshots as evidence |
| C5 | Language | TypeScript (Node) + Playwright | One process, typed artifacts |
| C6 | LLM | Default `ollama` + `qwen2.5-coder:7b`; Anthropic/OpenAI switchable | Local-first; 7b coder is reliable for locator JSON without 9b cold-load timeouts; override via `--model` |
| C7 | Architecture | Single CLI (`discover` / `replay` / `escalate` / `config`; later `apply` / `import-plan`) | No service mesh |
| D1 | Artifact | Versioned JSON + Zod | Reviewable, fail-closed |
| D2 | Locators | Ranked role/name → text → css | Prefer resilient targets |
| D3 | Outcomes | `SUCCESS` \| `BUSINESS_OUTCOME` \| `RECOVERABLE` \| `HARD_FAILURE` | Caller can branch |
| D5 | HITL | Same Playwright session; CLI resume | Captcha/MFA without new browser |
| D6 | Risky actions | Block by default; escalate | Safety |
| D7 | Secrets/PII | Never in Capability; profile via `--profile` only | Artifacts are shareable; people are not |
| D8 | Allowlist | Hosts + action types in config | Fail closed on navigation |
| E2 | Core stretch | S8 bindings + S9 `cua invoke` **done** | Callable + tenant overlay |
| E5 | Teach / repair | Opt-in capped only (max 5) | No unbounded loops |
| E6 | Forms | G1 field-maps / hybrid **shipped**; G2 author-steps unlocked; **G3 rejected** | Forms yes; open-ended autonomy no |
| E7 | Form evidence | Receipt + ats-family + ledger; HAR/trace on failure / opt-in | Avoid PII dumps |
| E8 | Good vs bad | Page is judge; LLM never self-scores fills | Truth in DOM |
| F1–F4 | Config / npm / Zod / `cua` | Locked | Operator control without redeploy |

## Product locks (2026-09-12)

| # | Decision | Choice | Why |
|---|---|---|---|
| G1 | Product track | Build Apply UI on `main`; tags stay frozen snapshots | Continuity without rewriting history |
| G2 | Upstream planning | **Out of this repo.** Import plan JSON → FieldMap; do not reimplement plan generation here | This repo owns fill/repair/HITL; planning stays upstream |
| G3 | Profile | Expand apply-profile schema + optional vault adapter; never bake PII into Capability | Reuse + privacy |
| G4 | Config overlay | `config.yaml` + gitignored `config.local.yaml` (merge) | Live hosts/secrets without polluting defaults |
| G5 | Auth | `session.storageStatePath` first-class (docs + CLI + gitignore); not a new subsystem | Login-once reuse |
| G6 | Submit | `--submit` **default off**; fill-only unless flag | Irreversible apply is explicit |
| G7 | Worker CLI | Target: `cua apply` (+ `import-plan`) with exit codes 0/2/3/4 | One command for callers |
| G8 | G2 cart / non-apply flows | **Parked** until Apply worker path works | Wrong product week |
| G9 | Reliability pack | Light frozen local fail fixtures (CAPTCHA/CLOSED) OK | Demo named outcomes without live ATS |
| G10 | Repo voice | Tracked docs/code reference **this product only** — no other apps, no prior-art writeups, no assignment framing | Clean private product tree |
| G11 | Hygiene | See `docs/REPO-HYGIENE.md` | Every agent keeps tip clean |
| G12 | Plan → fill | Imported FieldMap is seed for `fillFormFlow`; repair adds gaps only | Dead plan bridge blocked workers |
| G12a | Plan literals | FieldMap `literal` may hold resolved plan answers; treat those maps as **private** (D7 carve-out). Prefer `.private/` / gitignored outputs | Workers need plan values without baking vault into Capability |

## Explicitly out of scope (hold until new lock)

| Item | Why held |
|---|---|
| G3 unbounded discover/repair loops | Flaky, expensive; caps already exist |
| Always-on HAR / happy-path video | PII, size, noise |
| Merge hunter/queue product into this repo | Different product boundary |
| Payment / checkout submit | Wrong risk class |
| Replace upstream plan generator | Duplicate + worse planning |
| Commit secrets, storageState, live receipts, real profiles | Permanent leak risk |
| Full Workday account-create autonomy | Brittle week-sink; scaffold + storageState only |
| Copying third-party apply products | Legal + identity risk — patterns only, in-house code |

## Design & documentation standards

1. Map before code (`docs/ARCHITECTURE.md` + `docs/PRODUCTIZE.md`).
2. Mermaid + prose with the change.
3. Self-explanatory names; JSDoc `@file` + exported contracts.
4. Personas: Operator, Calling agent, System.

## Runtime config

`.env` + `config.yaml` + **`config.local.yaml` (gitignored, planned)** + CLI + `config show|validate|set`. Secrets never via `config set`.

## Agent pickup

1. Read this file + `docs/PRODUCTIZE.md` + `docs/agents/map.md`.
2. Follow `docs/agents/skills-playbook.md` (I0–I4 / D0–D3).
3. Ponytail `full` for code.
4. Obey `docs/REPO-HYGIENE.md` before every commit.
