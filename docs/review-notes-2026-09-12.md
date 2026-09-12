# Review notes — 2026-09-12

Pre-commit checkpoint: uncommitted G1 work vs tag `v0.1.0`.

## Docs onboarding ([Docs lens](65326fff-cd34-4119-917d-518173159cc0))

| Finding | Disposition |
|---|---|
| Graded vs G1 not one-lined | **Fixed** — README lead + DECISIONS E2/E6 wording |
| Missing copy-paste for `--profile` / hybrid / `--form-repair-max` / HAR | **Fixed** — README + REPORT §7–8 |
| `demo:g1` vs live ATS golden list confusion | **Fixed** — `docs/golden-forms.md` splits local one-command vs broader pack |
| README Co C “commented Ollama” vs script heuristics | **Fixed** — README shows Co C hybrid command |
| E2 “skip others” vs E6 shipped | **Fixed** — E2 marked done (S8/S9); G1 = E6 |
| “Multi-tenant plumbing” OOS vs G1 demos | **Fixed** — clarify SaaS tenancy ≠ bindings/forms |
| Failure pack lacked commands | **Fixed** — `docs/form-failure-pack.md` |

## Security ([Security](7fd88e95-f27b-4c8c-85e3-4ed154e40568))

| Finding | Disposition |
|---|---|
| F1 ignored `assertActionAllowed(fillFormFlow)` | **Fixed** — removed redundant call; step loop already gates all actions |
| F2 password env overlay + heuristic invent | **Fixed** — overlay only when profile already declares key; heuristics map password only if profile keys include it |
| F3–F6 host re-check / path jail / storageState / GH host | **Partial** — GH host regex anchored `(^|\.)greenhouse\.io$`; rest tracked for later |

## Architecture ([Architecture](45158045-2e51-4db4-bec6-821bd4c0ebd9))

| Finding | Disposition |
|---|---|
| Craft runs in deterministic mode | **Fixed** — craft wired only when `mode === 'hybrid'` |
| `requiredExtras` uses `c.required \|\| true` | **Fixed** — filter `Boolean(c.required)` |

## QA ([QA](dc46c739-1319-4b98-a859-154476f5187d))

| Finding | Disposition |
|---|---|
| Whitespace-only required bypasses preflight | **Fixed** — trim before empty check |
| Craft throw can abort fill | **Fixed** — try/catch around craft |
| Location NY/NJ false pass | **Fixed** — location match requires city prefix; self-check rejects Newark≠NYC |
| Self-checks not in `npm check` | **Fixed** — `npm run check:forms` wired into `check` |

## Spec ([Spec](4f3aa57f-9e36-44fe-ad2b-d716fb509706))

| Finding | Disposition |
|---|---|
| Fabricate Workday edu defaults | **Fixed** — no invented degree/FoS; no Bachelor fallback click |
| Craft fallback steals sibling answers | **Fixed** — same `profilePath` only |
| Repair/craft Ollama-only despite E9 switchable | **Track** — intentional ceiling for project; document in REPORT if needed |

## Standards ([Standards](91589c24-0625-4dbd-b6f6-b343f20fbc95))

| Finding | Disposition |
|---|---|
| ARCHITECTURE code map missing G1 modules | **Fixed** — table rows for fill/repair/ATS helpers |
| Self-checks unreachable | **Fixed** — `check:forms` |
| Missing `ponytail:` on craft/repair caps | **Fixed** — comments on fillForm / fillFormFlow ceilings |
| `replayCapability` long / duplicated arms | **Track** — extract shared form executor post-submit if needed |

## Bug hunt ([Bug hunt](30412a28-1209-4a64-8401-ebd3e88f9740)) + Fixes-needed ([Fixes-needed](2ae29c62-028b-428e-8f3b-cf37caebbc1b))

| Finding | Disposition |
|---|---|
| ATS family sniffed on `about:blank` | **Fixed** — refresh after navigate + before fill when still unknown; pass body text |
| `deterministic` still crafts via always-on `craftAnswer` | **Fixed** (prior) — `maybeCraft` only when `mode === 'hybrid'` |
| `resume.json` latch self-resumes second pause | **Fixed** — unlink after consume |
| Unescaped option regex (`5+ years`, `C++`) | **Fixed** — `escapeRe` on prompt/option clicks |
| One-way workAuth → flags | **Fixed** — sponsorship maps `workAuthYes=yes`, `sponsorshipNo=no` |
| Outcome codes missing on 14 apply caps | **Fixed** — all apply-* declare VERIFY/CAPTCHA/CLOSED/WIDGET |
| Proposed map overwrites one file | **Fixed** — also write `field-map-proposed-<mapId>.json` |
| howHeard always Workday-routed | **Fixed** — only when `formField-source` present |
| `required \|\| true` / dead `requiredOutputs` filter | **Fixed** |
| Orphaned self-checks | **Fixed** (prior) — `check:forms` (+ profile flags) |
| Non-Ollama silent LLM skip / retry-counter comment | **Track** — project ceiling; document if needed |

