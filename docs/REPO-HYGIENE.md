# Repo hygiene — keep the tree self-contained

Every agent, every commit. Product voice only.

## Never commit

| Path / kind | Why |
|---|---|
| `.env`, API keys, cookies | Secrets |
| `config.local.yaml` | Live hosts / local overrides |
| `**/storage-state*.json`, Playwright storageState | Session cookies |
| Real applicant profiles, resumes, live receipts | PII |
| `evidence/private/`, `evidence/runs/` | Ad-hoc / live |
| `.scratch/`, `graphify-out/`, `*.pdf` | Local planning / confidential docs |
| `capabilities/experiments/` | Scratch capabilities |

## Never write into tracked docs/code

| Topic | Instead |
|---|---|
| Other personal/company repos or “merge with X” | Describe the **contract** (plan JSON, profile JSON) |
| Prior-art / competitor product writeups | In-house design only |
| Assignment / take-home / grader framing | Product language: core mock, stretch, operator |
| “Steal from …” language | Implement patterns; cite nothing external in product docs |

Allowed: npm/runtime deps (Playwright, Zod, Ollama), ATS **family** names as domain (Ashby/Lever/Greenhouse/Workday) when they are features of *this* CLI, links inside **this** GitHub repo.

`agent-os/TOOLING.md` may list optional agent-tool install URLs (process kit). Do not put competitor apply products there.

## Pre-commit scan (agent)

```bash
git grep -nIE '\b[Gg]raders?\b|take-home|prior-art|Assignment A|Steals ideas|interface\.ai' HEAD || true
# Working tree:
rg -n '\b[Gg]raders?\b|take-home|prior-art|Assignment A|Steals ideas|interface\.ai' \
  --glob '!.scratch/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!evidence/g1-*/**' || true
```

Fix hits in tracked files before committing. Local `.scratch/` may contain research — it must stay gitignored.

## After large `src/` changes

```bash
graft build
```

## Commit attribution

Author only. No `Co-authored-by` / Cursor trailers.

## Tags

Do not move `v0.1.0` / `v0.2.0` for product work. New milestones → new tags on `main` when the human asks.
