# Issue tracker

**Source of truth for agents:** tracked map `docs/agents/map.md` + `docs/PRODUCTIZE.md`.

Optional local scratch (gitignored, never publish): `.scratch/<feature-slug>/` for private notes.

## Conventions (tracked)

- Product tickets live as rows in `docs/agents/map.md` (Status column uses triage labels).
- Sprint checklists live in `docs/PRODUCTIZE.md`.
- Do not require `.scratch/` to exist for an agent to start work.

## Optional local scratch

When using private wayfinder notes under `.scratch/`:

- One feature per directory: `.scratch/<feature-slug>/`
- Spec: `.scratch/<feature-slug>/spec.md`
- Issues: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Triage `Status:` line near the top (`triage-labels.md`)
- Comments under `## Comments`

## When a skill says "publish to the issue tracker"

Prefer updating `docs/agents/map.md`. Use `.scratch/` only for local research that must not be committed.

## When a skill says "fetch the relevant ticket"

Read `docs/agents/map.md` or the path the user gives.

## Wayfinding operations

- **Map (tracked):** `docs/agents/map.md`
- **Roadmap:** `docs/PRODUCTIZE.md`
- **Claim:** set Status to `claimed` on the map row before work
- **Resolve:** note done on the map row; tick the matching PRODUCTIZE checkbox
