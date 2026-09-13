# Domain glossary

Terms for this project. No implementation detail here — see `docs/ARCHITECTURE.md` and `DECISIONS.md` for design.

## Capability

A versioned, reviewable artifact that describes a reusable UI flow: typed inputs, ordered steps, ranked control targets, checkpoints, typed outputs, and declared business outcomes. Invoked without an LLM on the production path.

## Discovery

The one-time LLM-driven observe → decide → act run that accomplishes a natural-language goal and emits a Capability.

## Deterministic replay

Re-running a Capability with parameters using only recorded steps and locators — no model decisions.

## Business outcome

A legitimate domain result the caller must handle (e.g. member not found). Not a crash and not a soft retry.

## Recoverable condition

A transient or known interstitial the replay may dismiss or retry (slow load, expected dialog) without failing the run.

## Hard failure

An unexpected state: locator miss, policy violation, or unhandled UI — stop and surface debug detail.

member.NOT_FOUND

A declared business outcome code meaning no member matched the given ID. Not a hard failure.

## Operator

Human who runs CLI, edits config, and may take HITL control of the live session.

## Calling agent

Upstream AI (or CLI stand-in) that invokes a Capability with typed params and consumes the result contract.

## Surface driver

The layer that observes and acts on a UI (here: Playwright + accessibility locators). Swappable in design for legacy web or desktop later.

## Session ownership

Who currently controls the live browser context: automation or human. Pause → human → resume must keep the same session.

## Allowlist

Configurable set of permitted hosts and action types. Actions outside it are blocked or escalated.

## FieldMap

Versioned mapping from apply-form controls to profile paths or literals. Kept separate from Capability so profiles stay out of shareable artifacts.

## Apply profile

Operator-supplied JSON (via `--profile`) with applicant fields. Never embedded in Capability JSON.

## Plan JSON

Optional upstream planner output imported into a FieldMap. Planning itself is out of this repo; only the import contract lives here.
