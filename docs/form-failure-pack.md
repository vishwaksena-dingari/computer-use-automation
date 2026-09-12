# Form failure pack (council blind spot)

Frozen examples of “forms that fail today” and what cua does. Not a live scrape list. Mock must be up unless noted.

| Case | How to reproduce | Expected system behavior |
|---|---|---|
| **Missing required profile** | Profile without `phone`; `npx cua replay capabilities/apply-demo-co-c.json --mode hybrid --profile <gap.json> --escalate` | Preflight → `field.UNMAPPED`; HITL pause → resume `--note` fills first path (`evidence/g1-co-c-hitl-smoke`) |
| **Stale field-map + extra control** | `npm run demo:g1` (Co C leg) or `npx cua replay capabilities/apply-demo-co-c.json --mode hybrid --profile fixtures/applicant-profile-hybrid.json --form-repair-max 3` | Dormant repair ≤N → SUCCESS heuristics (`evidence/g1-co-c-autonomy-reprove`) |
| **Verify mismatch (location autocomplete)** | Ashby live location “New York, NY” vs expanded label | City-token `valuesMatch`; else `field.VERIFY` / repair |
| **Captcha / bot wall** | Page body mentions recaptcha (live boards) | Outcome `form.CAPTCHA`; `--escalate` → HITL (no bypass) |
| **Closed job** | Page “no longer accepting applications” | Outcome `form.CLOSED` |
| **Empty essay + craft:llm** | `./scripts/demo-craft-ollama.sh` (needs Ollama; empty `answers.whyCompany`) | Dormant craft wakes once → `evidence/g1-co-a-craft-dormant` (`llmCalls≥1`) |

Out of scope for this pack: solving captchas, creating employer accounts, submitting live applications.
