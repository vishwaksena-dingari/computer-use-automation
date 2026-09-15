#!/usr/bin/env bash
# Sync this kit → CLAUDE_SKILLS_ROOT/skills/agent-os → ~/.claude/skills/agent-os
# No hardcoded usernames or fixed home paths.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

# shellcheck source=paths.sh
source "$(cd "$(dirname "$0")" && pwd)/paths.sh"
HERE="${AGENT_OS_HOME:?Set AGENT_OS_HOME or run from agent-os/scripts/}"

SKILL="${AGENT_OS_SKILL:-}"
if [[ -z "$SKILL" ]]; then
  if [[ -n "${CLAUDE_SKILLS_ROOT:-}" ]]; then
    SKILL="$CLAUDE_SKILLS_ROOT/skills/agent-os"
  else
    echo "Set CLAUDE_SKILLS_ROOT to your skills library root (folder that contains skills/)." >&2
    echo "Example: export CLAUDE_SKILLS_ROOT=\"\$HOME/code/my-skills-library\"" >&2
    exit 1
  fi
fi
LIVE="${AGENT_OS_LIVE:-$HOME/.claude/skills/agent-os}"

mkdir -p "$SKILL/references" "$SKILL/assets/templates" "$SKILL/scripts"

if [[ -f "$HERE/FROM-PRD.md" ]]; then
  cp "$HERE/FROM-PRD.md" "$SKILL/references/from-prd.md"
  cp "$HERE/PLAYBOOK.md" "$SKILL/references/playbook.md"
  cp "$HERE/TOOLING.md"  "$SKILL/references/tooling.md"
  cp "$HERE/BUNDLE.md"   "$SKILL/references/bundle.md"
  cp "$HERE/SETUP.md"    "$SKILL/references/setup.md"
  cp "$HERE/README.md"   "$SKILL/README.md"
  [[ -f "$HERE/references/skill-catalog.md" ]] && cp "$HERE/references/skill-catalog.md" "$SKILL/references/skill-catalog.md"
  [[ -f "$HERE/skill-catalog.md" ]] && cp "$HERE/skill-catalog.md" "$SKILL/references/skill-catalog.md"
  [[ -f "$HERE/FACTORY.md" ]] && cp "$HERE/FACTORY.md" "$SKILL/references/factory.md"
  [[ -f "$HERE/MODULES.md" ]] && cp "$HERE/MODULES.md" "$SKILL/references/modules.md"
  [[ -f "$HERE/DUAL-SKILL.md" ]] && cp "$HERE/DUAL-SKILL.md" "$SKILL/references/dual-skill.md"
  [[ -f "$HERE/CAPABILITIES.md" ]] && cp "$HERE/CAPABILITIES.md" "$SKILL/references/capabilities.md"
  [[ -f "$HERE/PORTABLE.md" ]] && cp "$HERE/PORTABLE.md" "$SKILL/references/portable.md"
  [[ -f "$HERE/SKILL-ROOTS.md" ]] && cp "$HERE/SKILL-ROOTS.md" "$SKILL/references/skill-roots.md"
  cp "$HERE/TEMPLATES/"* "$SKILL/assets/templates/"
  cp "$HERE/scripts/"*.sh "$SKILL/scripts/"
  cp "$HERE/scripts/"*.tsv "$SKILL/scripts/" 2>/dev/null || true
elif [[ -f "$HERE/references/from-prd.md" ]]; then
  # Already skill layout. Skip self-copy when we *are* the library.
  if [[ "$(cd "$HERE" && pwd)" != "$(cd "$SKILL" && pwd)" ]]; then
    rsync -a --exclude SKILL.md "$HERE/" "$SKILL/"
    [[ -f "$HERE/SKILL.md" ]] && cp "$HERE/SKILL.md" "$SKILL/SKILL.md"
  fi
else
  echo "Unrecognized kit layout at $HERE" >&2
  exit 1
fi
chmod +x "$SKILL/scripts/"*.sh

if [[ ! -f "$SKILL/SKILL.md" ]]; then
  echo "WARN: $SKILL/SKILL.md missing — add a SKILL.md frontmatter file for Claude." >&2
fi

rm -rf "$LIVE"
cp -R "$SKILL" "$LIVE"
echo "Synced → $SKILL → $LIVE"
