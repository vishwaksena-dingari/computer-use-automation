# PLAYBOOK — decision + implementation routing (any project)

Canonical routers for agents. Project overlays may add phase matrices and sprint names; they must **not** weaken intensity caps (no “council everything”).

---

## Default posture

1. **Decide with intensity** (D0–D3) — human via grilling when preference/irreversible.  
2. **Design before module code** — Mermaid + prose with the change.  
3. **Implement with intensity** (I0–I4) — named sprints; not review-everything.  
4. **Ponytail** = anti-overengineering; **this playbook** = anti-overthinking.  
5. **Prove** with real runs/evidence, not screenshots alone.  
6. Do not run every installed skill every turn. See `references/skill-catalog.md` (vendored: keep a copy under `agent-os/` or rely on the skill).

---

## Decision intensity

| Rung | When | Do |
|---|---|---|
| **D0 Default** | Reversible + already decided | Use `DECISIONS.md` |
| **D1 Frame** | New, low stakes | wayfinder ticket → Answer → map |
| **D2 Grill** | Preference / naming | wayfinder → **grilling (HUMAN)** → lock |
| **D3 Council+Grill** | Expensive / irreversible | wayfinder → **one** llm-council → grilling → lock |
| **D4 Stop** | Still foggy after D3 | Human picks or provisional; no second council |

```mermaid
flowchart TD
  Q[Open question?] --> Tier{Decision intensity?}
  Tier -->|D0| Lock[Lock / DECISIONS default]
  Tier -->|D1| W[wayfinder]
  Tier -->|D2| W2[wayfinder] --> G[grilling: HUMAN]
  Tier -->|D3| W3[wayfinder] --> C[llm-council once] --> G
  W --> Lock
  G --> Lock
  Lock --> Clear{Clear enough to build?}
  Clear -->|no| Over{Already D3 once?}
  Over -->|no| Q
  Over -->|yes| Stop[Human or provisional]
  Clear -->|yes| Impl[Implementation routing]
```

**Rejected:** wayfinder + llm-council on every question.

---

## Implementation intensity

### Named sprints

Outcome names tied to the product slice. Tasks = checklist under the sprint. No epic/OKR theater.

### Rungs

| Rung | When | Do |
|---|---|---|
| **I0 Ship** | Tiny reversible edit | ponytail → code → smoke |
| **I1 Task close** | Normal task | ponytail → implement → self-check → map checkbox |
| **I2 Risky task** | Schema, auth, money, secrets, classifiers | I1 + ponytail-review or focused tests |
| **I3 Sprint close** | Sprint “Done when” met | **wayfinder retarget**; council only if new expensive fork; **human** if path cuts demo scope |
| **I4 Slice / release** | Milestone or submit | One of: multi-lens-review, critic, or gstack `/review` — not all stacked by default |

```mermaid
flowchart TD
  Start[Named sprint] --> Arch[Architecture section exists?]
  Arch -->|no| Docs[Update architecture docs first]
  Arch -->|yes| Task[Next task]
  Docs --> Task
  Task --> Code[ponytail implement]
  Code --> Check{Blast radius?}
  Check -->|tiny| Next{More tasks?}
  Check -->|normal| Smoke[Self-check]
  Check -->|risky| Review[ponytail-review / tests]
  Smoke --> Next
  Review --> Next
  Next -->|yes| Task
  Next -->|sprint done| Retarget[wayfinder retarget]
  Retarget --> Human{Path change?}
  Human -->|yes| Grill[grilling]
  Human -->|no| More{More sprints?}
  Grill --> More
  More -->|yes| Start
  More -->|milestone| Prove[Evidence + I4 review]
```

**Rejected:** multi-lens + code-review + council after every task.

Mid-sprint retarget only if: assumptions broke, blocked ≳1h, or human changed goals.

---

## Modularity

- **Inside repo:** clear seams, one job per module, pure functions at boundaries.  
- **Outside / other projects:** do not publish packages “just in case.” Clean folders copy later.

---

## Anti-overthinking vs anti-overengineering

| Failure | Guard |
|---|---|
| Too much code / abstraction | **ponytail** |
| Endless councils / tickets / reviews | **Intensity caps** + human stop |

---

## Session start

1. `DECISIONS.md` (if any)  
2. This playbook + project overlay  
3. Wayfinder map — open tickets? which named sprint?  
4. Architecture section for the module you will touch  
5. Ponytail full for code  
6. No secrets in git; no invented preference locks  

---

## Stuck → research dig (aggressive)

Trigger when **blocked ≳20–30 min** on the same surface bug (widget won’t stick, auth gate, multipage advance, locator thrash) **or** the human says dig into public examples.

**Do this before inventing a third local heuristic:**

1. **Search** public sources for the *exact* surface (e.g. Workday nested select / education block).  
2. **Shallow-clone** into `.scratch/research-clones/<name>/` (gitignored). Never vendor AGPL/runtime agents into the product.  
3. **Reuse patterns only** — selectors, auth persistence (`storageState`), overlay dismiss, page-validate-then-advance, upload sequences. Keep notes local under `.scratch/` (keep vs reject).  
4. **Port the smallest working idea** into *our* capability factory (observe → map → `llmCalls:0` replay). Reject always-on LLM tool loops.  
5. **Prove** with a headless (default) evidence run on ≥1 live or mock target.

Do **not** commit third-party project names, clone lists, or research notes to the public tree — keep that under `.scratch/`.

If the project overlay defines a stricter dig list, **follow the overlay**.
