# capabilities/

Runtime artifacts written by **discover / train**. Empty until you train.

Do **not** store hand goldens here. Private backups (ignored by git / Cursor / app defaults):

`.private/golden-capabilities/`

## Retrain (mock — core)

```bash
./scripts/ensure-mock.sh   # or rely on train.sh auto-start
./scripts/train.sh --model llama3.2:3b --verbose
# writes: capabilities/lookup-member-savings-balance.json

./scripts/run.sh M-10042 --headed
./scripts/run.sh M-99999
```

## Sauce Demo (optional experiment)

LLM train for Sauce is **not** wired (discover skeleton is member-lookup only).  
Golden backup is only under `.private/` for human reference — the app does not load it unless you pass an explicit `--seed` path.

Replay if you copy a working artifact into `capabilities/` yourself:

```bash
./scripts/try-sauce.sh --headed
./scripts/try-sauce.sh --bad-login
```
