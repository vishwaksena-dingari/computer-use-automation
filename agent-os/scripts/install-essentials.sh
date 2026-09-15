#!/usr/bin/env bash
# Install Agent OS companion skill packs (machine-wide).
# Usage:
#   bash install-essentials.sh              # essential npx + library-copy
#   bash install-essentials.sh --extras     # essentials + consider-later packs
#   bash install-essentials.sh --dry-run    # print only
#   bash install-essentials.sh --list       # catalog
# Never hardcodes usernames. Failures are reported; they do not abort the rest.
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

# shellcheck source=paths.sh
source "$(cd "$(dirname "$0")" && pwd)/paths.sh"
HERE="${AGENT_OS_HOME:?Cannot find Agent OS kit}"
PACKS="${HERE}/scripts/skill-packs.tsv"
LIVE_ROOT="${HOME}/.claude/skills"
VENDOR="${AGENT_OS_VENDOR:-$HOME/.agents/vendor}"
SKILLS_HOME="${AGENT_OS_SKILLS:-$HOME/.agents/skills}"
mkdir -p "$VENDOR" "$SKILLS_HOME"

EXTRAS=0
DRY=0
LIST=0
for arg in "$@"; do
  case "$arg" in
    --extras) EXTRAS=1 ;;
    --dry-run|--dry) DRY=1 ;;
    --list) LIST=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$PACKS" ]]; then
  echo "Missing pack catalog: $PACKS" >&2
  exit 1
fi

want_tier() {
  case "$1" in
    essential) return 0 ;;
    extra) [[ "$EXTRAS" -eq 1 ]] ;;
    companion) return 1 ;;
    *) return 1 ;;
  esac
}

echo "=== Agent OS skill packs ==="
echo "catalog: $PACKS"
echo "mode: $([ "$EXTRAS" -eq 1 ] && echo essentials+extras || echo essentials) $([ "$DRY" -eq 1 ] && echo DRY-RUN)"
echo

ok=0
fail=0
skip=0

while IFS=$'\t' read -r tier pack github method role; do
  [[ -z "${tier:-}" || "$tier" == \#* ]] && continue
  if [[ "$LIST" -eq 1 ]]; then
    printf '%-10s %-42s %-10s %s\n' "$tier" "$pack" "$method" "$github"
    continue
  fi

  if [[ "$tier" == "companion" ]]; then
    continue
  fi
  if ! want_tier "$tier"; then
    continue
  fi

  echo "→ [$tier] $pack"
  echo "  $github"
  echo "  $role"

  if [[ "$DRY" -eq 1 ]]; then
    echo "  (dry-run) $method"
    skip=$((skip + 1))
    echo
    continue
  fi

  case "$method" in
    npx)
      if npx --yes skills add "$pack" -g -y; then
        echo "  OK"
        ok=$((ok + 1))
      else
        echo "  FAIL — retry later: npx skills add $pack -g -y"
        fail=$((fail + 1))
      fi
      ;;
    npm-global)
      pkg="@nanonets/graft"
      [[ "$pack" == "graft" ]] || pkg="$pack"
      if command -v npm >/dev/null 2>&1 && npm i -g "$pkg"; then
        echo "  OK (CLI). Per-repo: graft init --agents cursor claude -y --no-global"
        ok=$((ok + 1))
      else
        echo "  FAIL — retry: npm i -g $pkg"
        fail=$((fail + 1))
      fi
      ;;
    uv-tool)
      pkg="graphifyy"
      if command -v uv >/dev/null 2>&1 && uv tool install "$pkg"; then
        echo "  OK (CLI graphify). Per-repo after src/: graphify ."
        ok=$((ok + 1))
      else
        echo "  FAIL — retry: uv tool install $pkg"
        fail=$((fail + 1))
      fi
      ;;
    gstack-clone)
      if [[ -d "${HOME}/.claude/skills" ]] || command -v claude >/dev/null 2>&1; then
        mkdir -p "$LIVE_ROOT"
        dest="${LIVE_ROOT}/gstack"
      else
        dest="${VENDOR}/gstack"
      fi
      # Official checkout lives under ~/.claude/skills/gstack. ./setup --host auto
      # then fans skills to every *detected* host (Cursor, Codex, OpenCode, …).
      # Override: GSTACK_HOST=cursor  (or claude, codex, …). Never vendor into agent-os/.
      gstack_host="${GSTACK_HOST:-auto}"
      gstack_setup() {
        (cd "$dest" && ./setup --host "$gstack_host" --no-prefix --quiet --no-plan-tune-hooks)
      }
      if [[ -d "$dest/.git" || -x "$dest/setup" ]]; then
        if [[ -x "$dest/setup" ]] && gstack_setup; then
          echo "  OK fan-out --host $gstack_host (existing $dest not overwritten)"
          ok=$((ok + 1))
        else
          echo "  FAIL — existing checkout, setup --host $gstack_host failed"
          echo "  Retry: cd $dest && ./setup --host $gstack_host --no-prefix --quiet --no-plan-tune-hooks"
          fail=$((fail + 1))
        fi
      elif ! command -v git >/dev/null 2>&1; then
        echo "  FAIL — git required to clone $github"
        fail=$((fail + 1))
      else
        mkdir -p "$LIVE_ROOT"
        if git clone --single-branch --depth 1 "$github.git" "$dest"; then
          if [[ -x "$dest/setup" ]]; then
            if gstack_setup; then
              echo "  OK → $dest + --host $gstack_host"
              ok=$((ok + 1))
            else
              echo "  FAIL — clone ok, setup --host $gstack_host failed"
              echo "  Retry: cd $dest && ./setup --host $gstack_host --no-prefix --quiet --no-plan-tune-hooks"
              fail=$((fail + 1))
            fi
          else
            echo "  OK clone (no setup script) → $dest"
            ok=$((ok + 1))
          fi
        else
          echo "  FAIL — git clone $github"
          fail=$((fail + 1))
        fi
      fi
      mkdir -p "$VENDOR"
      if [[ "$dest" != "${VENDOR}/gstack" ]]; then
        ln -sfn "$dest" "${VENDOR}/gstack"
        echo "  pointer → \$AGENT_OS_VENDOR/gstack"
      fi
      ;;
    pstack-vendor)
      dest="${VENDOR}/pstack"
      mkdir -p "$VENDOR"
      if [[ -d "$dest/skills" ]]; then
        echo "  SKIP — already at $dest (not overwritten)"
        skip=$((skip + 1))
      else
        src=""
        for cand in "${HOME}/.cursor/plugins/cache/cursor-public/pstack/"*; do
          if [[ -d "$cand/skills" ]]; then src="$cand"; fi
        done
        if [[ -n "$src" ]]; then
          mkdir -p "$dest"
          cp -R "$src/skills" "$dest/skills"
          [[ -d "$src/agents" ]] && cp -R "$src/agents" "$dest/agents"
          [[ -d "$src/.cursor-plugin" ]] && cp -R "$src/.cursor-plugin" "$dest/.cursor-plugin"
          printf 'copied from Cursor plugin cache\nsrc=%s\n' "$src" > "$dest/ORIGIN.txt"
          echo "  OK copy → $dest (from cache)"
          ok=$((ok + 1))
        elif command -v git >/dev/null 2>&1; then
          tmp="$(mktemp -d "${TMPDIR:-/tmp}/pstack-vendor.XXXXXX")"
          if git clone --single-branch --depth 1 --filter=blob:none --sparse "$github.git" "$tmp"; then
            (cd "$tmp" && git sparse-checkout set pstack)
            if [[ -d "$tmp/pstack/skills" ]]; then
              mkdir -p "$dest"
              cp -R "$tmp/pstack/." "$dest/"
              printf 'sparse clone from %s\n' "$github" > "$dest/ORIGIN.txt"
              echo "  OK sparse clone → $dest"
              ok=$((ok + 1))
            else
              echo "  FAIL — clone had no pstack/skills"
              fail=$((fail + 1))
            fi
          else
            echo "  FAIL — git clone $github (pstack slice)"
            fail=$((fail + 1))
          fi
          rm -rf "$tmp"
        else
          echo "  FAIL — no Cursor pstack cache and no git"
          fail=$((fail + 1))
        fi
      fi
      echo "  Cursor runtime still needs /add-plugin pstack. Other hosts: Read $dest + agent-os/PORTABLE.md"
      ;;
    library-copy)
      src=""
      if [[ -n "${CLAUDE_SKILLS_ROOT:-}" && -d "${CLAUDE_SKILLS_ROOT}/skills/${pack}" ]]; then
        src="${CLAUDE_SKILLS_ROOT}/skills/${pack}"
      elif [[ -d "${HERE}/../${pack}" ]]; then
        src="$(cd "${HERE}/../${pack}" && pwd)"
      fi
      if [[ -z "$src" ]]; then
        echo "  SKIP — no library copy (clone $github or keep it under \$CLAUDE_SKILLS_ROOT/skills/${pack})"
        skip=$((skip + 1))
      else
        mkdir -p "$LIVE_ROOT"
        if cp -R "$src" "$LIVE_ROOT/${pack}"; then
          echo "  OK → $LIVE_ROOT/${pack}"
          ok=$((ok + 1))
        else
          echo "  FAIL copying $src"
          fail=$((fail + 1))
        fi
      fi
      ;;
    *)
      echo "  SKIP — unknown method $method"
      skip=$((skip + 1))
      ;;
  esac
  echo
done < "$PACKS"

if [[ "$LIST" -eq 1 ]]; then
  exit 0
fi

echo "=== Companion tools (not auto-npx — print install lines) ==="
while IFS=$'\t' read -r tier pack github method role; do
  [[ -z "${tier:-}" || "$tier" == \#* ]] && continue
  [[ "$tier" != "companion" ]] && continue
  echo "• $pack — $role"
  echo "  $github"
  case "$pack" in
    ponytail)
      echo "  Cursor: marketplace ponytail  OR  copy .cursor/rules/ponytail.mdc"
      echo "  Claude: /plugin marketplace add DietrichGebert/ponytail"
      ;;
    pstack)
      echo "  Vendor copy: ~/.agents/vendor/pstack (essentials installer)"
      echo "  Cursor runtime: /add-plugin pstack then /setup-pstack"
      echo "  Other hosts: Read the vendor SKILL.md + agent-os/PORTABLE.md"
      echo "  $github"
      ;;
    gstack)
      echo "  Canonical checkout: ~/.claude/skills/gstack"
      echo "  Fan-out to every detected host: cd ~/.claude/skills/gstack && ./setup --host auto"
      echo "  Unsupported host (Amp, Zed, Jules, …): copy agents-digest/gstack-AGENTS.md into AGENTS.md"
      echo "  docs: ${github}/blob/main/docs/skills.md"
      ;;
    graft)
      echo "  npm i -g @nanonets/graft"
      echo "  per repo: graft init --agents cursor claude -y --no-global"
      ;;
    graphify)
      echo "  uv tool install graphifyy && graphify install"
      echo "  per repo (after src/): graphify ."
      ;;
  esac
  echo
done < "$PACKS"

echo "=== Claude Code marketplace (if /skills misses Addy) ==="
echo "/plugin marketplace add https://github.com/addyosmani/agent-skills.git"
echo "/plugin install agent-skills@addy-agent-skills"
echo

echo "=== Summary ==="
echo "installed/copied: $ok   failed: $fail   skipped: $skip"
echo "Intensity caps still win — installing a pack is not 'run every skill'."
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
