# Computer-use automation (computer-use automation)

Capability factory: **discover once (LLM) → versioned artifact → deterministic Playwright replay (no LLM)** against a local hostile bank-ish mock.

## Quick start

```bash
npm install
npx playwright install chromium
npm run mock          # http://127.0.0.1:4173/member-lookup/
npm run build
npm run cua -- discover --allow-offline-seed
npm run cua -- replay --member-id M-10042 --chapter 02-replay-happy
npm run cua -- replay --member-id M-99999 --chapter 03-replay-exception
# or:
npm run demo:slice
```

## Docs

- `REPORT.md` — design write-up  
- `DECISIONS.md` — locked choices  
- `docs/ARCHITECTURE.md` — map  
- `evidence/README.md` — grader bag  

## Safety

Do not commit `.env` or the confidential PDF. Secrets stay in environment only.
