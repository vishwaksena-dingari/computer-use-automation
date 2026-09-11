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
    CLI["CLI `cua` — discover / replay / invoke / escalate / config"]
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
| `apps/mock-core/member-lookup-beta/` | **S8** | Yes | Tenant Beta label skin (same API) |
| `src/session/` | **S6** | Partly | HITL intervention / resume files |
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
| `--hitl-locator-patch` | Opt-in note→locator patch (still opaque clicks) |
| `capabilities/bindings/tenant-beta.json` | S8 overlay |
| `/member-lookup-beta/` | Second mock skin |
| `cua invoke <id>` | S9 thin typed call (params in → replay result out) |

---

## 11. Doc ↔ diagram rule

When you add or change a module:

1. Update this file (or add `docs/<module>.md` with Mermaid).
2. Add/adjust the file module docstring and public function docstrings in code.
3. Keep names identical across diagram labels, file paths, and symbols.
