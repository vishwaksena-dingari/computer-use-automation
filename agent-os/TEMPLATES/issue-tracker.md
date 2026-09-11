# Issue tracker: Local Markdown

Issues and specs live as markdown under `.scratch/` (default). Override in `DECISIONS.md` if the human requires GitHub/Linear/Jira.

## Conventions

- One effort per directory: `.scratch/<feature-slug>/`
- Spec (optional): `.scratch/<feature-slug>/spec.md`
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` (never one combined tickets file)
- Use template: `agent-os/TEMPLATES/wayfinder-ticket.md`
- Triage / wayfinder status: `Status:` near top (`open` / `claimed` / `resolved`, or triage-labels roles)
- Comments: append under `## Comments`

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/issues/` (create dirs if needed).

## When a skill says "fetch the relevant ticket"

Read the path the user (or map) referenced.

## Wayfinding operations

- **Map**: `.scratch/<effort>/map.md` — Destination / Notes / Decisions so far / Not yet specified / Out of scope
- **Child ticket**: `Type:` = `research` | `prototype` | `grilling` | `task`; `Status:` = `open` | `claimed` | `resolved`
- **Blocking**: `Blocked by: NN, NN` — unblocked when every listed ticket is `resolved`
- **Frontier**: open, unblocked, unclaimed; lowest number wins
- **Claim**: `Status: claimed` before work
- **Resolve**: `## Answer`, `Status: resolved`, pointer on map Decisions-so-far
