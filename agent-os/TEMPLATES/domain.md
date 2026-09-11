# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the root if it exists (multi-context): read each relevant context.
- **`docs/adr/`**: ADRs that touch the area you're about to work in. Multi-context: also `src/<context>/docs/adr/`.

If these files don't exist, **proceed silently**. `/domain-modeling` (via grilling / architecture skills) creates them lazily when terms actually get resolved.

## File structure

Single-context (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Multi-context (root `CONTEXT-MAP.md` present):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                 ← system-wide
└── src/<context>/CONTEXT.md + docs/adr/
```

## Vocabulary

Use glossary terms from `CONTEXT.md`. Don't invent synonyms the glossary avoids. Missing terms → note for `/domain-modeling`.

## ADR conflicts

If output contradicts an ADR, surface it explicitly rather than silently overriding.
