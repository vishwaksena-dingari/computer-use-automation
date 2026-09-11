# Gitignore / ignore snippets (Agent OS + common tools)

Append what you need. Do not force Graft on every repo.

## Always (secrets)

```
.env
.env.*
!.env.example
```

## Local planning (optional — often keep `.scratch/` in git for solo work)

```
# Uncomment if scratch must stay private:
# .scratch/
```

## Graft (after `graft init`)

`.gitignore`:

```
# graft's local graph cache — regenerable (run `graft build`).
/graft/
```

`.ignore` (so ripgrep can still see graft cards while git ignores them):

```
# graft's cards are gitignored but should stay greppable
!graft/
graft/.cache/
graft/.graph/
```

## Node / Python (add only if the project uses them)

```
node_modules/
dist/
build/
__pycache__/
.venv/
```
