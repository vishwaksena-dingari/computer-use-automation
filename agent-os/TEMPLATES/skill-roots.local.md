# Skill homes (machine-local — gitignore this file)

Filled at **setup** (Q9). Agents `Read` these paths. Do not commit.

| Kind | Path |
|---|---|
| npx packs | `$HOME/.agents/skills` (or `AGENT_OS_SKILLS`) |
| Vendor trees (gstack / pstack) | `$HOME/.agents/vendor` (or `AGENT_OS_VENDOR`) |
| Custom (if Q9 specified) | |

**Never:** `<repo>/agent-os/` or the Agent OS library.

If a path is empty, create it (`mkdir -p`) before clone/copy.
