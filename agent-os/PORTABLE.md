# PORTABLE — jobs a folder copy still cannot execute

Clone / vendor copy gives **files**. This file is the **method** any harness
runs when the host lacks Cursor Task, pstack model slugs, or gstack
slash-commands.

Read the vendor copy first if it exists (`$HOME/.agents/vendor/pstack`,
`$HOME/.agents/vendor/gstack` or `$HOME/.claude/skills/gstack`). If a named
tool in that file is missing **on this host**, drop to the method below.
Do not stop. Do not invent worktrees you cannot create.

---

## Arena (parallel implement / sketch) — I3/I4 only

pstack `arena` wants Cursor Task + named models + git worktrees. Without that:

1. **Frame** — one prompt, one rubric (3–6 gradeable criteria), N=2 or 3.  
2. **Fan out** — spawn N children with **this host’s** subagent tool (Claude `Task`,
   Codex parallel threads, or two sequential passes if the host has no children).
   Each writes only to `.scratch/arena/<slug>/c<n>/`. Same prompt. Host-default
   models — do not demand `grok-4.6-fast-xhigh`.  
3. **Judge** — parent reads every candidate end to end. Score the rubric. Pick
   the base a future maintainer can extend.  
4. **Graft** — port 1–2 ideas from losers by hand. Do not paste.  
5. **Verify** — same bar as any I4.  
6. **One writer** after the pick. Children do not all commit.

If the host cannot spawn children: two sequential sketches in those dirs, then
the same pick/graft. That is still arena-the-method. It is not the Cursor plugin.

---

## Architect / how

Without pstack `/architect` + `/how`:

1. **How** — trace the live call path of the module you will change. Interface
   first (`modules.md`). Do not dump `src/`. Write a short traced model.  
2. **Sketch twice** — two structurally different shapes (arena method above, or
   dual-skill). Empty bodies / signatures OK.  
3. **Pick** — smaller public surface that hides more. Screen shallow modules.  
4. **Fill** — implement against the sketch. Deviations are signal.  
5. **Scrap** — if the same workaround repeats, throw the sketch out and return
   to step 1. Do not bolt.

Factory stages 2–3 + `codebase-design` already are this desk. Use them.

---

## Review / ship / canary / browse

| Missing | Portable method |
|---|---|
| gstack `/review` | One of: critic / multi-lens / Matt `code-review`. Not stacked. |
| gstack `ship` / `land-and-deploy` | Addy `shipping-and-launch` + a checklist in the map |
| gstack `canary` / `browse` binaries | **Cannot fake.** Need the gstack checkout + Playwright. If the clone exists, run those bins even from Cursor/Codex. If there is no clone, skip canary; prove in the browser you have. |

---

## What a vendor copy is for

`$HOME/.agents/vendor/pstack` and `…/gstack` exist so **any** harness can
`Read` the real `SKILL.md`. That is discovery.

This file exists so the session still **finishes the job** when those
`SKILL.md` files name tools the current host does not have.
