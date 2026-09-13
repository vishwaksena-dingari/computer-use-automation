# Harden remaining — review + multi-model — 2026-09-13

**Scope:** `git diff 89649fc` (fe13dd8 + working-tree follow-ups).  
**Models:** `claude-opus-5-thinking-high`, `gpt-5.6-sol-medium`, `cursor-grok-4.6-high-fast`, `composer-2.5-fast` (parallel).

---

## Multi-model synthesis

### Consensus (2+ models) → fixed this session

| Finding | Models | Disposition |
|---|---|---|
| Empty-fill `failDetail` → `blocker: null` (`classifyFillBlocker` miss) | Opus, Grok | **Fixed** — `/empty fill/` → `missing_required` + self-check |
| `opaqueCoerced` counted all `_plan.*` | All 4 | **Fixed** — `importPlanToFieldMapWithStats` real coerce count |
| Dangling symlink write-jail bypass | Opus, GPT | **Fixed** — `lstatSync` refuse dangling leaf |
| T-B-27b could drop required literals | Opus, Grok | **Fixed** — keep `f.required` literals |
| `--evidence` unjailed | Opus | **Fixed** — T-B-30 resolveUnderRoot on discover/replay/invoke/apply |

### Lone / consider

| Finding | Model | Disposition |
|---|---|---|
| `workAuth: true` boolean / string `"false"` truthiness | GPT | **Fixed** — boolean normalize; `=== true` for structured flags |
| Citizen-only sponsorship inference gap | Composer | **Noted** — intentional T-B-28b; vault must set sponsorship fields |
| CSS-only shadow (label/role) | Composer, Grok | **Noted** — documented ponytail ceiling |
| Opaque coerce fail-open stores literals | Grok | **Noted** — T-B-24 by design |
| Unused `relative`/`isAbsolute` | Opus, Grok | **Fixed** |
| Symlink self-check plant | Grok | **Consider** later (manual) |
| Type unions / extract empty-fill | prior | **Dismissed** YAGNI |

### Disagreements

- GPT rated dangling symlink **critical**; Opus **warning** — same fix shipped.
- Composer found no critical jail issues pre-lstat; others did — fixed anyway.

---

## Prior act-on / consider (pre multi-model) — already fixed

T-B-27b · T-B-28b · T-B-29 · JSDoc · APPLY · self-checks · form_defaults order · writeFieldMap realpath · receipt failDetail args · import `--out` log

## Gate

`npm run check:forms` + `npm run check:config` green after multi-model follow-ups.
