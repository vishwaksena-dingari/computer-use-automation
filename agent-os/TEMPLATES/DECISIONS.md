# Decision Sheet

≤1–2 pages. Edit here; do not expand into a PRD.

## Destination

_

## Locked choices

| # | Decision | Choice |
|---|---|---|
| A1 | Root agent file | `CLAUDE.md` |
| B1 | Done shape | |
| B2 | Language / stack | |
| B3 | Planning | Wayfinder map under `.scratch/<slug>/` |
| B4 | Package manager | |
| B5 | Secrets | `.env` only — never `config set`, never commit |

## Design & documentation standards

1. **Map before code** (`docs/ARCHITECTURE.md`).
2. **Mermaid + prose** in the same change as modules.
3. **Self-explanatory names** — verb-first functions; units/roles in names.
4. **Module + export docs** — `@file` + short contract/why on exports.
5. **Personas** — who touches what; don’t leak internals into operator UX.

## Runtime config principle (if the product has operator settings)

Anything an operator might change without shipping code → runtime-configurable:

- **Secrets:** env / `.env` only  
- **Non-secrets:** config file and/or safe `config set`  
- Redeploy only for *code* changes  

## Out of scope (for now)

- _

## Provisionals (human confirm)

- _
