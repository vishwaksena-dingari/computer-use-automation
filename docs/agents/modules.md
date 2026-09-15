# Modules — this repo’s public surfaces

**Fill this file** so an amnesiac agent can navigate without dumping `src/`.

Use these words only: **module**, **interface**, **implementation**, **depth**,
**shallow**, **seam**, **adapter**, **leverage**, **locality**. Do not swap in
“service,” “component,” or “API” unless that *is* the interface kind.

| Term | In this repo |
|---|---|
| Module | A folder/package/slice with one public surface |
| Interface | Everything a caller must know (not only the type line) |
| Implementation | The body — stay out unless you are building *this* module |
| Depth | Behaviour a caller can exercise per fact they must learn |
| Seam | Where that interface lives; where tests attach |
| Adapter | Concrete stand-in at a seam (need **two** before the seam is real) |
| Leverage | Capability per unit of interface (callers) |
| Locality | Changes and bugs concentrate in one module (maintainers) |

---

## Module index

Filesystem is the map. Exports strangers may import come only from the
interface (entry file / package exports / CLI / HTTP / UI props).

| Module (folder) | Interface kind | Public entry | Hides (one line) | Test through | Status |
|---|---|---|---|---|---|
| | function / package / CLI / HTTP / UI / events / port | | | | stub |

## Seam records

| From | To | Kind | Errors | Adapters (0/1/2) | Stand-in for tests |
|---|---|---|---|---|---|
| | | | | | |

Locked = kind + errors + stand-in filled. Parallel slices only then.

## Deepening log

When the tree starts to feel like a ball of mud, run Matt
**improve-codebase-architecture** (human picks the candidate — not AFK).
Record the date and which candidate you took.

| Date | Candidate | Outcome |
|---|---|---|
| | | |
