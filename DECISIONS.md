# Decision Sheet — Computer-Use Automation

≤1 page. Locked 2026-09-11. Edit here; do not expand into a PRD.

## Destination

Working vertical slice: discover → typed capability artifact → deterministic replay (happy + one business-exception) → same-session HITL pause/resume → `/evidence/` + `REPORT.md`. Not a product clone; not multi-tenant runtime.

## Locked choices

| # | Decision | Choice |
|---|---|---|
| A1 | Root agent file | `CLAUDE.md` |
| B1 | Done shape | Vertical slice above |
| B2 | Pre-code doc | This file only |
| B3 | Planning | Wayfinder map under `.scratch/` then build |
| C1 | Product proximity | Capability-factory slice only |
| C2 | Proxy target | Hybrid: small local “hostile” bank-ish mock + Playwright |
| C4 | Computer-use | Playwright + accessibility roles/names; screenshots as evidence |
| C5 | Language | TypeScript (Node) + Playwright |
| C6 | LLM | **Default `ollama` + `qwen3.5:9b`**; switchable to `anthropic` / `openai` via config/env/CLI |
| C7 | Architecture | Single CLI/process (`discover` / `replay` / `escalate` / `config`) |
| C8 | Package / bin | npm `computer-use-automation`; CLI bin `cua` (demo: `cua discover\|replay\|escalate\|config`; not scoped npm org packages) |
| D1 | Artifact | Versioned JSON Schema capability |
| D2 | Locators | Ranked: role/name → text → css fallback |
| D3 | Outcomes | `SUCCESS` \| `BUSINESS_OUTCOME` \| `RECOVERABLE` \| `HARD_FAILURE` |
| D4 | Exception demo | Bad input / not-found → `BUSINESS_OUTCOME` |
| D5 | HITL | Pause same Playwright session; headed/manual control; CLI `resume` |
| D6 | Risky actions | Block by default; escalate |
| D7 | Secrets/PII | Never persist raw; redact logs/artifacts |
| D8 | Allowlist | Allowed hosts + allowed action types |
| E1 | Evidence | Discovery + happy replay + exceptional replay + sample artifact |
| E2 | Stretch | **After core only.** Prefer (1) second-tenant variant + `bindings` overrides; optional (2) callable capability invoke. Skip others unless time. Decide schema details when starting the stretch — not before S1. |
| E5 | P3 teach / repair | **Unlocked 2026-09-11 (human).** Opt-in only: `--record-actions` (HITL click→locator merge); `--autonomous-repair` (discover+replay loop on `locator_miss`, hard max 5). Default paths unchanged (opaque clicks; no repair loop). |
| E3 | Time box | ~2–3 focused days |
| E4 | Verify skill | Skip for now |
| F1 | Config mutation | `config show` / `validate` / **`config set`** (non-secrets only) |
| F2 | Package manager | **npm** (`package-lock.json`) |
| F3 | Validation | **Zod** (locked) |
| F4 | Package / CLI | package `computer-use-automation`, bin `cua` (locked) |

## Design & documentation standards (locked)

1. **Map before code.** User-facing vs internal surfaces are drawn first (`docs/ARCHITECTURE.md`). Implement only against that map.
2. **Mermaid + prose in parallel.** Every architectural change updates diagrams and text together — no orphan diagrams, no undocumented modules.
3. **Self-explanatory names.** Files, classes, functions, variables: verb-first functions, nouns for types, units/roles in names (`memberId`, `resolveLocator`, `ReplayEngine`). No cryptic abbreviations.
4. **Module + function docs.** Every source file has a top-of-file module docstring (JSDoc `@file`); every exported function/class has a short docstring stating *why/contract*, not narrating the obvious.
5. **Personas.** Operator (CLI/HITL), Calling agent (capability I/O), System (internal). Don’t leak internals into the operator UX.

## Runtime config principle (user control > redeploy)

Anything an operator might change without shipping new code must be runtime-configurable:

- **Secrets:** API keys via env / `.env` (gitignored) — never via `config set`, never committed
- **Provider/model:** default Ollama; cloud optional — `config set`, env, or CLI flags
- **Target:** base URL / entry route of the mock app
- **Policy:** allowlist hosts + action types in `config.yaml` (edit file or `config set` for scalar/list keys)
- **Limits:** max steps, timeouts

**Surface:** `.env` + `config.yaml` + CLI flags + `config show|validate|set`.  
Redeploy only for *code* changes (schema, replay engine), not for key/provider/allowlist tweaks.

## Out of scope (for now)

Queues, clusters, multi-tenant plumbing, desktop driver implementation, polished operator console, capability marketplace UI, full settings web UI.

Stretch goals (tenant variant / callable invoke) are **deferred** until the vertical slice works — see E2.
