# Live Ashby / private runs

**Default demo:** local Ashby-shaped mock at `/apply-demo/ashby-shaped/` — multi-section apply without real ATS.

```bash
./scripts/try-ashby.sh
# or
npx cua invoke apply-ashby-shaped --profile fixtures/applicant-profile.json
```

**Live ATS (optional):** set `ASHBY_APPLY_URL` to a careers/apply URL, allowlist the host in local config (not committed), run hybrid + `--escalate` for EEO/upload/auth. Evidence under `evidence/private/` (gitignored). Never commit cookies, HAR embed, or real PII.

HITL: `cua escalate resume --run <id> [--note "..."]`.
