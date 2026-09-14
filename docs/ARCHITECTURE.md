# Architecture map — user-facing vs internal

**Rule:** Design and document *before* implementing a module. Every module gets a Mermaid view in this file (or a linked doc) in the same change as the code. Docs and diagrams stay parallel — if the code changes, the diagram changes in the same PR/commit.

See also: `DECISIONS.md`, `docs/artifact-schema.md`, `docs/config-surface.md`, `docs/mock-core.md`, `docs/hitl-contract.md`, `docs/evidence-layout.md`, coding standards in `CLAUDE.md`.

---

## 1. Who is “the user”?

Three personas. Only the first two *touch* anything in v1:

| Persona | Role | Touches |
|---|---|---|
| **Operator** | Human running the project / HITL | CLI, `.env`, `config.yaml`, headed browser when escalated |
| **Calling agent** | Upstream AI that invokes a capability | Capability contract (JSON in/out) — CLI stand-in for now |
| **System** | Discovery, replay, policy, session | Invisible; only evidence/logs when debugging |

Operators use the CLI / HITL path.

---

## 2. What the user touches vs what they don’t see

```mermaid
flowchart TB
  subgraph USER["User-facing (Operator + Calling agent)"]
    ENV[".env — API keys"]
    CFG["config.yaml — provider, model, allowlist, target, limits"]
    CLI["CLI `cua` — discover / replay / invoke / apply / import-plan / escalate / config"]
    CAP_IO["Capability invoke — typed params in, result out"]
    BROWSER["Headed browser — only during HITL takeover"]
    EVIDENCE["/evidence — logs, screenshots, artifacts to inspect"]
  end

  subgraph INTERNAL["Internal (user does not operate these directly)"]
    DISCOVER["Discovery loop — LLM observe → decide → act"]
    ARTIFACT["Artifact store — versioned capability JSON"]
    REPLAY["Replay engine — deterministic steps, no LLM"]
    POLICY["Policy guard — allowlist, risky-action gate, redaction"]
    SESSION["Session controller — pause / owner / resume"]
    SURFACE["Surface driver — Playwright + a11y locators"]
    MOCKAPP["Local hostile mock bank UI"]
  end

  ENV --> DISCOVER
  CFG --> POLICY
  CFG --> DISCOVER
  CFG --> REPLAY
  CLI --> DISCOVER
  CLI --> REPLAY
  CLI --> SESSION
  CAP_IO --> REPLAY
  DISCOVER --> SURFACE
  REPLAY --> SURFACE
  SURFACE --> MOCKAPP
  DISCOVER --> ARTIFACT
  ARTIFACT --> REPLAY
  DISCOVER --> POLICY
  REPLAY --> POLICY
  DISCOVER --> SESSION
  REPLAY --> SESSION
  SESSION --> BROWSER
  DISCOVER --> EVIDENCE
  REPLAY --> EVIDENCE
  SESSION --> EVIDENCE
```

**Touches:** config, commands, capability I/O, HITL browser, evidence folder.  
**Doesn’t touch:** LLM prompts, locator resolution internals, redaction pipeline, step executor — those stay internal but documented.

---

## 3. End-to-end control flow

```mermaid
sequenceDiagram
  actor Op as Operator
  participant CLI
  participant Discover as Discovery loop
  participant LLM
  participant Surf as Surface driver
  participant Art as Artifact store
  participant Replay as Replay engine
  participant Pol as Policy
  participant Sess as Session controller

  Op->>CLI: discover --goal "..." 
  CLI->>Discover: start run
  loop until goal or stop
    Discover->>Surf: observe (a11y tree + optional screenshot)
    Discover->>LLM: decide next action
    Discover->>Pol: check allowlist / risk
    alt blocked or stuck
      Discover->>Sess: pause + intervention request
      Sess->>Op: take headed browser
      Op->>Sess: resume
    else allowed
      Discover->>Surf: act (click/type/navigate)
    end
  end
  Discover->>Art: write capability JSON
  Discover->>Op: path to artifact + evidence

  Op->>CLI: replay --artifact ... --params ...
  CLI->>Replay: run without LLM
  Replay->>Pol: check each step
  Replay->>Surf: resolve locator + act
  Replay->>Op: SUCCESS / BUSINESS_OUTCOME / HARD_FAILURE + outputs
```

---

## 4. Capability as the agent-facing contract

```mermaid
flowchart LR
  subgraph INPUT["Caller supplies"]
    P["typed params e.g. memberId"]
  end
  subgraph CAP["Capability artifact vN"]
    META["id, version, description"]
    STEPS["ordered steps + ranked locators"]
    CK["checkpoints / success condition"]
    OUT["typed output schema"]
  end
  subgraph RESULT["Caller receives"]
    R["status + outputs OR business outcome OR hard failure"]
  end
  P --> CAP --> R
```

The calling agent never sees the discovery transcript — only this contract.

---

## 5. Session ownership (HITL)

```mermaid
stateDiagram-v2
  [*] --> AutomationOwns
  AutomationOwns --> Paused: stuck / risky / policy block
  Paused --> HumanOwns: operator takes live session
  HumanOwns --> AutomationOwns: resume signal
  HumanOwns --> Completed: operator finishes goal
  AutomationOwns --> Completed: checkpoint met
  AutomationOwns --> Failed: hard failure
```

Same browser context across states. Control transfer is real; operator UI can stay minimal (headed window + CLI).

---

## 6. Module map

Names are intentional — rename only with a doc+diagram update.

| Module / path | Status | User-facing? | Responsibility |
|---|---|---|---|
| `src/cli/main.ts` | **S1+** | Yes | `cua` — discover / replay / **invoke** / escalate / config |
| `config.yaml` + `.env` | **S1** | Yes | Runtime knobs without redeploy |
| `src/config/` | **S1** | No | Zod schema; load/merge; `config set` |
| `src/artifact/` | **S3** | Partly | Capability Zod + load/save |
| `capabilities/` | **S3** | Yes | Saved capability JSON |
| `src/surface/` | **S4** | No | Ranked Playwright locator resolution |
| `src/replay/` | **S4** | No | Deterministic step engine |
| `src/policy/` | **S4** | No | Allowlist + risky gate |
| `src/discover/` | **S5+** | No | Observe → LLM locator emit; optional HITL note patch (`patch-locator.ts`) |
| `src/artifact/bindings.ts` | **S8** | No | `bindings` overlay: entryPath + target remaps |
| `src/artifact/fill-form.ts` | **G1** | No | Profile → field-map fill + verify + craft wake |
| `src/artifact/fill-receipt.ts` | **G1** | No | Redacted fill receipt + `valuesMatch` |
| `src/artifact/repair-field-map.ts` | **G1** | No | Observe → heuristic/LLM field-map repair |
| `src/artifact/form-outcomes.ts` | **G1** | No | Map fill failure detail → `form.*` codes |
| `src/artifact/profile.ts` | **G1** | No | Nested profile get/set + path flatten |
| `src/surface/observe-controls.ts` | **G1** | No | DOM control inventory for repair |
| `src/surface/detect-ats.ts` | **G1** | No | ATS family sniff (Ashby/GH/Lever/Workday) |
| `src/surface/greenhouse-boards.ts` | **G1** | No | Greenhouse boards-api enum hints |
| `src/surface/workday-widgets.ts` | **G1** | No | Workday multiselect / education widgets |
| `src/surface/page-errors.ts` | **G1** | No | Visible page-error scrape for outcomes |
| `apps/mock-core/member-lookup-beta/` | **S8** | Yes | Tenant Beta label skin (same API) |
| `src/session/` | **S6+P3** | Partly | HITL intervention / resume; opt-in action recorder (`record-actions.ts`) |
| `src/evidence/` | **S7** | No | Chapter helpers |
| `apps/mock-core/` | **S2** | Yes | Bank-ish UI + JSON-table API |
| `evidence/` | **S7** | Yes | Graded demo bag + live runs |
| `REPORT.md` | **S7** | Yes | Design write-up |


### S1 config merge (implemented)

```mermaid
flowchart LR
  CLI["CLI flags"] --> MERGE["loadConfig()"]
  ENV[".env / process.env"] --> MERGE
  YAML["config.yaml"] --> MERGE
  DEF["CODE_DEFAULTS"] --> MERGE
  MERGE --> RC["RuntimeConfig + sources"]
  RC --> SHOW["config show"]
  RC --> VAL["config validate"]
  SET["config set"] --> YAML
```

Precedence: CLI > env > `config.yaml` > code defaults. Lists **replace** from the winning layer. Secrets only via env; `config set` refuses `*API_KEY*` paths.

### S2 mock-core surface (implemented)

Full screen contract: [`docs/mock-core.md`](./mock-core.md).

```mermaid
flowchart LR
  OP[Operator / Playwright] --> URL["http://127.0.0.1:4173/member-lookup/"]
  URL --> PAGE["Bank-ish hostile UI"]
  PAGE -->|GET| API["/api/members/:id"]
  API --> JOIN["lib/db.js join"]
  JOIN --> T1[members.json]
  JOIN --> T2[accounts.json]
  JOIN --> T3[contacts.json]
  API -->|M-10042| FOUND["master + contact + accounts"]
  API -->|M-99999| NF["kind=not_found HTTP 200"]
```

Serve with `npm run mock` — static files **plus** thin JSON-table API (no Postgres).
Slightly dynamic: API latency, `role=status`, footer clock, multi-account join.

---

## 7. Artifact schema (deep dive)

Full draft: [`docs/artifact-schema.md`](./artifact-schema.md).

```mermaid
flowchart TB
  subgraph ART["Capability artifact file"]
    META[id / version / description]
    IN[inputs — typed params]
    OUT[outputs — typed extracts]
    BO[businessOutcomes — declared codes]
    STEPS[steps — navigate/fill/click/branch/extract]
    TGT[targets — ranked locator candidates]
    CK[checkpoints — success + exception detects]
  end
  META --- IN
  IN --- STEPS
  STEPS --- TGT
  STEPS --- CK
  CK --- BO
  STEPS --- OUT
```

Calling agent sees **inputs + outputs + outcomes**. Operator may review the whole JSON. Discovery transcript stays in `/evidence/`, not inside the capability.

---

## 8. Config surface (deep dive)

Full draft: [`docs/config-surface.md`](./config-surface.md).

```mermaid
flowchart LR
  subgraph TOUCH["Operator touches"]
    ENV[.env secrets]
    YAML[config.yaml policy + defaults]
    FLAGS[CLI flags]
  end
  subgraph HIDDEN["Merged internally"]
    RC[RuntimeConfig object]
  end
  ENV --> RC
  YAML --> RC
  FLAGS --> RC
  RC --> DISC[discover]
  RC --> REP[replay]
  RC --> ESC[escalate]
```

Precedence: CLI flags > env > `config.yaml` > code defaults.

---

## 10. Operator packaging + debug logging

**Not** a production platform — thin wrappers so anyone can train (discover) and run (replay).

```mermaid
flowchart LR
  SETUP["scripts/setup.sh"] --> MOCK["npm run mock / compose mock"]
  MOCK --> TRAIN["scripts/train.sh → cua discover"]
  TRAIN --> ART["capabilities/*.json"]
  ART --> RUN["scripts/run.sh → cua replay"]
  RUN --> EV["evidence/*"]
  LOG["CUA_LOG / --verbose → stderr"] -.-> TRAIN
  LOG -.-> RUN
```

| Surface | Command |
|---|---|
| Setup once | `./scripts/setup.sh` |
| Train / save workflow | `./scripts/train.sh` (or `npm run train`) |
| Run saved workflow | `./scripts/run.sh M-10042` / `M-99999` |
| Full demo | `npm run demo:slice` |
| Docker mock | `docker compose up mock` |
| Docker slice | `docker compose run --rm cua` |

**Debug logging:** `CUA_LOG=debug` or `cua … --verbose` writes step breadcrumbs to **stderr** (stdout stays machine JSON). Evidence `run.json` remains the durable ledger.

---

## 10b. Bounded self-heal + tenant bindings (post-core)

```mermaid
flowchart TD
  R[replay] -->|locator_miss + --auto-retrain| D[discover once]
  D --> R2[replay retry capped 1-2]
  R -->|--escalate STUCK| H[HITL pause]
  H -->|resume --note + --hitl-locator-patch| P[one LLM target patch]
  P --> R3[retry stuck step]
  R -->|--bindings overlay| B[remap entryPath + targets]
  B --> T[Tenant Beta skin]
```

| Flag / path | Role |
|---|---|
| `--auto-retrain` | Opt-in capped re-discover on `locator_miss` |
| `--autonomous-repair` | P3 opt-in repair loop (max 5) |
| `--hitl-locator-patch` | Opt-in note→locator patch (still opaque clicks by default) |
| `--record-actions` | P3 opt-in HITL click→locator teach |
| `capabilities/bindings/tenant-beta.json` | S8 overlay |
| `/member-lookup-beta/` | Second mock skin |
| `cua invoke <id>` | S9 thin typed call (params in → replay result out) |

---

## 10c. G1 hybrid forms (post-`v0.1.0` — locked E6)

Additive. Does **not** replace §3 core mock flow.

```mermaid
flowchart TD
  FF[fillForm] --> TRY[try existing map / fill]
  TRY -->|ok| OUT[outcomes + receipt]
  TRY -->|missing map or stuck| REP[dormant repair loop ≤N: observe + heuristics + optional LLM]
  REP --> RETRY[retry fill]
  RETRY -->|still stuck + budget| REP
  RETRY -->|ok or exhausted / no progress| OUT
  MODE[mode hybrid] -.->|also| CRAFT[craft empty essay fields]
  CRAFT --> TRY
```

| Piece | Contract |
|---|---|
| `fillForm` step | Zod arm; `fieldMapRef` + profile; **preflight** all empty required profile paths (except craftable) before touching controls; skip optional; `field.UNMAPPED` / `field.VERIFY` / `form.*` if gap |
| Select snap | Observe captures option labels → `enumHints`; fill snaps profile value to live `<option>` / hints (exact → casefold → yes/no → contains). Greenhouse: optional boards-api `?questions=true` merges option labels onto empty select/combobox controls |
| Combobox / react-select | Open `.select__control`, type, pick option; verify via `.select__single-value` (input often stays empty) |
| Sponsorship polarity | Negated “without requiring sponsorship” → Yes when `flags.sponsorshipNo` truthy; positive “require sponsorship?” → `invertBool` so truthy maps to No |
| Profile aliases | `fullName` → `firstName`/`lastName` when split fields asked |
| Field-maps | `capabilities/field-maps/<id>.json` |
| Dormant repair loop (both modes) | Happy path = **0 LLM**. Stuck → repair+retry up to `--form-repair-max` (default **3**, hard cap **5**). Stops early if the same failure detail repeats (no progress). Persist with `--write-field-map`. Not unbounded G3. |
| Dormant craft LLM (both modes) | Wakes only for empty dynamic fields (`craft:llm`, required `answers.*` / textarea). Prompt includes **profile context** (secrets skipped). Cap ≈ `--form-repair-max`. Profile values still win when present. |
| `--mode hybrid` / `deterministic` | Same repair + craft dormancy; mode kept for CLI compat. Use **hybrid** when the map may be stale (Co C) or essays need craft; Co A/B happy path stays deterministic |
| Verify + receipt | After each fill, read-back verify; write `evidence/fill-receipt.json` (redacted). Optional `blocker` enum: `captcha\|closed\|widget\|missing_required\|verify`. Required mismatch → stuck repair |
| Repair few-shot | When repair LLM wakes, inject sibling green map fields + receipt keys for known `ats-family` (`docs/golden-forms.md`); hold-out skips self mapId; **`unknown` family gets no few-shot** (no demo-co-a default, G20) |
| Location verify | City/location autocomplete expansions match on city token (`New York, NY` ≈ `New York City…`) |
| Multipage | `fillFormFlow`: engine sets `allowLlm` on page 0 / stuck / retry; routine later pages use heuristics only; craft via per-arm `makeCraftAnswer` |
| `--write-field-map` | Opt-in persist repaired map to repo |
| `--form-repair-max` | Cap stuck repair iterations (1–5; default 3) |
| `--profile` | Invoke/replay context only; never inside Capability JSON (PII / reuse). `WORKDAY_EMAIL`/`PASSWORD` overlay at invoke time |
| `--record-har` | Opt-in `network.har` (bodies omit by default; evidence only — not fulfill) |
| `--har-on-failure` | With `--record-har`: delete HAR after success (retain on failure only) |
| `--trace-on-failure` | Playwright `trace.zip` under evidence only when the run fails |
| Live ATS | Ashby + Lever auto proven headless; Workday widgets + `fillFormFlow` validate-retry; auth via `session.storageStatePath`; ATS family → `evidence/ats-family.json` |
| Self-sufficiency | Dynamic shell + dormant repair/craft — capability factory, not always-on agent |
| `--escalate` (dormant HITL) | **Needed as last resort** (MFA, captcha, judgment, secrets). Off by default; with `--escalate`, pause after repair budget exhausted / policy block. Captcha/closed page text → `form.CAPTCHA` / `form.CLOSED`. Not every run. |
| Form outcome codes | `field.UNMAPPED` (missing required), `field.VERIFY`, `form.WIDGET`, `form.CAPTCHA`, `form.CLOSED` — same D3 outcome enum as bank mock |
| Demo | `npm run demo:reviewer` (core mock + Co A/B/C); Co A/B deterministic; Co C stale+extra hybrid |
| Templates | Optional `template` field — `docs/templates.md` |

Queue: `.scratch/capability-factory-general/ROADMAP.md`.

---

## 10d. G2 author-steps (unlocked)

Opt-in discover mode. Default discover stays **locators-only** into a code-owned skeleton.

```bash
cua discover --author-steps --goal "…" --out capabilities/experiments/authored-capability.json
```

LLM emits Zod-capped `steps` + `targets` (+ optional checkpoints/IO); one repair pass; evidence `author-steps.json`. Replay of the authored artifact is still deterministic (`llmCalls: 0` unless hybrid/HITL).

**Prove:** offline `fixtures/g2-authored-member-lookup.json` via `selfCheckAuthorSteps` (`check:forms`); optional live `npm run demo:author-steps`.

**Apply/ATS shortcut:** if the goal looks like apply and the page is an ATS family, emit a **dynamic shell** (`navigate → wait → fillFormFlow`) with **0 LLM** — field maps stay runtime-dynamic. Prefer this over long fixed fill/click chains.

**Reject:** free tool graphs (G3); LLM on every replay step; hand-maintained per-company step laundry lists.

---

## 11. Doc ↔ diagram rule

When you add or change a module:

1. Update this file (or add `docs/<module>.md` with Mermaid).
2. Add/adjust the file module docstring and public function docstrings in code.
3. Keep names identical across diagram labels, file paths, and symbols.

## Product track (Apply UI)

Operator guide: **`docs/APPLY.md`**. Status: `docs/PRODUCTIZE.md` / `docs/agents/map.md`. Locks: `DECISIONS.md` G1–G12.

### Bridge — plan → fill (G12)

Imported FieldMaps seed `fillFormFlow`; repair only adds gaps. Plan answers may live on FieldMap `literal` (treat maps with literals as private).

**Literal vs heuristic:** plan literals may win over *optional* survey owners sharing a CSS control; they never displace a *required* heuristic owner (hostile/stale plan). Pass-2 shadow drop never removes `required:true` map rows even when requiredness was undetected on the control owner (T-B-27); colliding plan literals on that selector are dropped instead (T-B-27b). Opaque unanswered plan keys coerce to `_plan.*` instead of aborting import (T-B-24). File fields always use profile `resumePath` (no plan literals; uploads are document extensions only under the repo realpath jail). `--out` write paths (import-plan + discover) realpath the nearest existing ancestor (T-B-25/T-B-29). `workAuth: "Yes"` normalizes to `Authorized`; bare Authorized/Yes does not imply `flags.sponsorshipNo` (T-B-28/T-B-28b).

```mermaid
flowchart LR
  plan["--plan-json / import-plan"] --> fmap[FieldMap on disk]
  fmap --> seed[loadFieldMapById]
  seed --> filter[filterFieldMapToControls]
  filter --> repair["repairFieldMap mode=add"]
  repair --> fill[runFillForm]
  fill --> banner[successBanner done-check]
```

### Worker harden — live ATS honesty (post T-B-7)

Live Ashby Overview URLs returned SUCCESS with an empty receipt; vault `location` objects filled as `[object Object]`.

```mermaid
flowchart TD
  nav[navigate URL] --> open["openApplyFormSurface if no controls"]
  open --> host{same allowed host?}
  host -->|no| fail4h[HARD_FAILURE host escape]
  host -->|yes| obs[observeControls]
  obs -->|still empty| fail4["BUSINESS_OUTCOME empty fill → exit 4"]
  obs -->|has controls| fill[runFillForm]
  fill --> loc["location: city token + region snap or skip"]
  fill --> keys{filledKeys length?}
  keys -->|0| fail4
  keys -->|gt 0| ok[SUCCESS exit 0]
  fill --> shots["page-N-before/after-fill + optional 00-after-open-form"]
  fill --> cache["seed miss → .private/field-maps only"]
  ok --> sub{--submit?}
  sub -->|yes + banner| submitted[outcome submitted]
  sub -->|yes clicked no banner| unconf[outcome submit_unconfirmed exit 4]
  sub -->|blocked unverified required| verifyBlock[outcome verify exit 4]
```

| Guard | Behavior |
|---|---|
| Location display | `getProfilePath('location')` formats `{city,region,country}` → `"City, Region, Country"` |
| Location typeahead | Needle `City, ST`; **require** whole-city token match (+ region when present); else skip/fail — no blind Enter |
| Empty fill | Never SUCCESS when `filledKeys` is empty (`fillForm` **and** `fillFormFlow`); receipt includes `failDetail` |
| Overview → form | Click Application / Apply (≤~2s poll, T-W-13); **re-assert host** against allowlist |
| Seed cache | Missing seed → write **`.private/field-maps/<id>.json`** only after verified fill (G16); `--write-field-map` → tracked |
| Submit claim | `outcome: submitted` only when confirmation text/banner observed; click without banner → `submit_unconfirmed` |
| Pre-submit | Unverified required keys in receipt → do not click Submit (G20) |
| Live wrapper | `apply-live.sh` → `node dist/cli/main.js`; always rewrite `resumePath` when resume copied |
| Page gallery | `fillFormFlow` writes `00-after-open-form` + `page-{N}-before/after-fill` under `screenshots/` + `screenshots-manifest.json` |

**Act-on locks (D0, 2026-09-13 reviews):** T-W-8 observe submit · T-W-9 fail-closed location · T-W-10 private seed cache · T-W-12 resume rewrite · T-W-14 origin check · T-W-15 local CLI. No tracked Maximor-specific `auto-ashby.json`.

| Surface | Module / CLI |
|---|---|
| Config overlay | `config.local.yaml` → `loadConfig` layer `local` |
| Profile | `normalizeApplyProfile` (vault hoist) + `--storage-state` |
| Import plan | `cua import-plan` → Zod PlanJson, aliases, `literal`, `surveyPlan`, `successBanner` |
| Page-filter | `filterFieldMapToControls` before repair (multipage perf) |
| Worker apply | `cua apply` + `worker-exit` codes; seed ≠ wipe; empty-fill fail; observed submit |
| Golden CI | `npm run check:golden` (incl. bridge-alias fixture) |
| HAR | Kept only under `evidence/private/` (or `CUA_ALLOW_PUBLIC_HAR=1`) |

Core mock + G1 forms remain frozen at tags `v0.1.0` / `v0.2.0`. Apply/train/G2 prove frozen at **`v0.3.0`**.

### Gen — flexible I/O bag (G13–G16)

| Piece | Behavior |
|---|---|
| Messy profile | Unknown top-level scalars → `answers.*` (`normalizeApplyProfile`) |
| Worker return | `gathered`: extracts + fill-receipt entries + `missingOutputs` + `submitVerified` |
| Form success | `fillForm` / `fillFormFlow` capabilities: page success checkpoint can SUCCESS even if some Capability `outputs[]` empty (gaps listed in message / gathered) |
| Submit | Confirmation banner ⇒ `submitted`; harvest light (empty `gathered.filled`) |
| Site FieldMap persist | G16 / T-G-5: `shouldPersistSiteFieldMap` — need ≥1 verified fill; if `--submit` clicked submit, also need `submitConfirmed`. Evidence `field-map-proposed*` uncapped. |
| Submit proof (G17) | `extractSubmitProof` → `gathered.confirmationText` / `confirmationReference`; `submitVerifyState`; click without banner → `submit_unconfirmed` |
| Profile shape (G18) | `prepareApplyProfile` keeps raw+normalized clones; evidence `profile-shape.json` keys only; worker `phases` |
| Soft optional + family confirm (G19) | Empty optionals → `skippedOptional`; required gaps → `missingRequiredPaths`; confirm regex/phrases via AtsFamily adapters |
| Pre-submit gate (G20) | `--submit` refuses click if required keys in receipt are unverified; unknown family has no demo few-shot |
| Not in scope | Unbounded any-website explore (G3) |

### Factory cleanup — one LLM door, dual fill arms, shared CLI runner

Post-`v0.4.0` hygiene (map T-F-*). **Do not** merge `fillForm` / `fillFormFlow` schemas. Repair LLM gate is an explicit `allowLlm` flag from the engine (no `/fillFormFlow page/` reason sniff). Craft budgets are **per arm** via `makeCraftAnswer`. Deterministic heuristics live in pure `inferFieldMap`; observation + LLM stay in `repairFieldMap`.

```mermaid
flowchart TD
  CLI["cua apply | replay | invoke"] --> RUN[runCapabilityRequest]
  RUN --> ENG[replayCapability]
  ENG --> FF[fillForm arm]
  ENG --> FLOW[fillFormFlow arm]
  FF --> CRAFT1["makeCraftAnswer budget A"]
  FLOW --> CRAFT2["makeCraftAnswer budget B"]
  FF --> FILL[runFillForm]
  FLOW --> FILL
  FLOW --> REP[repairFieldMap]
  REP --> INFER[inferFieldMap pure]
  REP -->|allowLlm| LLM[callModel]
  CRAFT1 --> LLM
  CRAFT2 --> LLM
  LLM --> OLLAMA[ollama]
  LLM --> ANTH[anthropic]
  LLM --> OAI[openai]
```

| Module | Role |
|---|---|
| `src/llm/call-model.ts` | Provider-neutral `callModel` + `callOllamaJson`; never throws; CI stubs need no cloud keys |
| `src/artifact/craft-answer.ts` | `makeCraftAnswer({ budget })` — one budget per factory instance |
| `src/artifact/infer-field-map.ts` | Pure control→field heuristics |
| `src/artifact/repair-field-map.ts` | Observe + merge + optional LLM (`allowLlm`) |
| `src/cli/run-capability-request.ts` | Shared replay + `result.json` (+ optional `worker.json`); no `process.exit` |
| Engine helpers | `persistFillReceipt`, `fillNow`, `pauseHitl`; Workday via `tryFillWorkdayField` |

**Live matrix (fill-only, gitignored):** Ashby Maximor exit 0; Lever 100ms exit 0; Greenhouse Figma still `field.VERIFY` (location widget) — allowlisted, not a code gate.