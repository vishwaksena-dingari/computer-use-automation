# MODULES — interface first, implementation on demand

This is the program-design rule for every adopted repo. Vocabulary is shared
with Matt **codebase-design** (use these words; do not swap in “service,”
“component,” or “API” unless that *is* the interface kind).

| Term | Meaning |
|---|---|
| **Module** | Anything with an interface and an implementation (function, package, folder, slice). Scale-agnostic. |
| **Interface** | Everything a caller must know: names, args, invariants, errors, config, performance — not only a type line. |
| **Implementation** | The body. Hidden from callers and from most agent sessions. |
| **Depth** | Lots of behaviour per unit of interface a caller must learn. **Shallow** = the interface is almost as big as the body. |
| **Seam** | Where that interface lives — the place you change behaviour without editing callers. |
| **Adapter** | A concrete stand-in at a seam (HTTP vs in-memory). One adapter is hypothetical; two makes the seam real. |
| **Leverage** | Callers get more capability per fact they learn. |
| **Locality** | Changes, bugs, and tests concentrate in one module instead of spreading. |

The filesystem **is** the map. A mental grouping that is not a folder (or
package entry) is invisible to an amnesiac agent. Cross-module imports that
skip the public entry recreate the first picture: a web of tiny squares with
stray arrows.

---

## What “good” looks like (the second picture)

A few **deep** modules. Each has a small, obvious public surface. Internals
stay inside that folder. Every export a stranger (human or agent) may import
comes **from that interface**, not from a nested file.

Agents start at the folder name and the public types. They do **not** load
the body to decide whether to call it. That is progressive disclosure for
code — the same idea as loading only one Agent OS reference per mode.

Open the implementation when:

- this session is **Build** of *that* module, and the interface is already locked
- a test that already crosses the interface failed
- the interface itself is wrong (hidden ordering, leaked errors, missing config)
- brownfield deepening: you cannot hide a decision you have not seen
- performance, trust, or failure work that depends on real I/O

Otherwise **stop at the interface**. Peeking “for context” burns tokens and
invites edits to internals that did not need to change.

---

## Interface kind is chosen per module

Do not default every contract to HTTP. Kind is whoever actually calls it.

| Kind | When | Lock before Build |
|---|---|---|
| Function / class exports | In-process logic | Names, args, results, errors, purity |
| Package entry (`index` / `exports`) | Shared folder other packages import | Public vs internal; no deep-path imports |
| CLI | Operator is the persona | Commands, flags, exit codes, stdout |
| HTTP / RPC | Another process | Paths, schemas, one error shape, auth, idempotency |
| UI component | Parent view / screen | Props, a11y name, empty/error; what it does *not* fetch |
| Events / queue | Async fan-out | Payload, delivery, idempotency, poison |
| Port + adapter | Two real backends or prod vs in-memory | Port methods + **two** adapters |

Picker: who is the caller? Does behaviour *already* vary across the seam?
If only one production path, do not invent a port.

---

## Rules (enforce in Program Design, then every coding session)

1. **Hide a decision.** If deleting the module does not push complexity onto
   N callers, it is a pass-through — merge it.
2. **Small public surface.** Prefer a few entry points. Internals may be
   finely split; they are not exports.
3. **The interface is the test surface.** Callers and tests cross the same
   seam. If you must mock past it, the module is the wrong shape.
4. **Taste lives at the seam.** Humans lock naming, invariants, and what
   belongs in which module. Agents may fill the body once tests lock
   behaviour (gray box: inspect when needed, not by default).
5. **No stray imports.** Other modules import the public entry only.
   TypeScript repos may enforce this with dependency-cruiser / package
   exports (Matt `setup-ts-deep-modules` when that skill is available).
6. **Horizontal design = these seams**, not a backlog of “schema then API
   then UI.” Vertical slices walk *through* locked interfaces.

---

## Skills

| Job | Skill |
|---|---|
| Vocabulary + design the shape | Matt **codebase-design** (design-it-twice when the interface is foggy) |
| Brownfield survey: where are we shallow? | Matt **improve-codebase-architecture** (HTML report → grill one candidate) |
| Contract-first network/module APIs | Addy **api-and-interface-design** |
| TS enforcement of entry points | Matt **setup-ts-deep-modules** (in-progress; optional) |
| Dual pair | codebase-design **vs** api-and-interface-design; brownfield: improve-codebase-architecture **vs** codebase-design |

`improve-codebase-architecture` is **not** optional trivia. See **Cure** below.

---

## Prevention vs cure

AI makes *writing* cheap. A change that does not take the rest of the
tree into account still leaves a nick. Nicks pile up. The tree becomes
harder to change — a ball of mud that is expensive to reverse.

| Mode | When | What |
|---|---|---|
| **Prevention** | Greenfield + every coding session | This file + Program Design: deep modules, small surfaces, tests at seams |
| **Cure** | Brownfield, entropy, “beyond repair,” or every few days on a fast repo | Matt **improve-codebase-architecture** |

The cure is **not** an AFK loop. The agent is tactical (surveys, proposes
shapes). The human is strategic (picks the candidate, locks the surface,
decides long-term health). Auto-mode / “just fix the architecture” skips
the judgment that stops the next nick.

### Cure loop (HITL)

1. Shared vocabulary first (table at the top). Precision beats vibe synonyms.
2. Run **improve-codebase-architecture**. It explores, then writes an HTML
   report of deepening candidates (shallow clusters, split seams, poor
   locality / leverage). It does **not** implement.
3. Human picks **one** candidate. Grilling shapes the module. Optional:
   design-it-twice on the interface.
4. Hand off as a ticket (`to-tickets` / `to-issues`) — then Build with
   tests through the new seam.
5. Cadence: about **every couple of days** on a fast-moving repo; on
   arrival in a hard-to-change tree, **before** feature work (you need a
   harness: tests at real seams, or you cannot tell if the agent helped).

A “legacy” tree is usually a tree that is hard to change: many shallow
modules, low locality. Do not start feature agents there without a
survey + at least one locked seam you can test through.

---

## Session rule for agents

1. Read `docs/agents/modules.md` (and the module index in `docs/ARCHITECTURE.md`).
2. Read that module’s public interface.
3. If you are a caller: use it. Do not open the body.
4. If you are the builder: lock tests through the interface, then edit the body.
5. If the interface is lying: stop, grill, widen or shrink the surface, then continue.
6. If the tree feels like scattered nicks / a ball of mud: stop feature
   work, run the cure loop, wait for a human pick.
