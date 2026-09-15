#!/usr/bin/env bash
# Probe which Agent OS engines are present. Print an offer table.
# Does not install. Does not clone into agent-os/.
# Usage: bash offer-missing.sh
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

# shellcheck source=paths.sh
source "$(cd "$(dirname "$0")" && pwd)/paths.sh"

VENDOR="${AGENT_OS_VENDOR:-$HOME/.agents/vendor}"
SKILLS="${AGENT_OS_SKILLS:-$HOME/.agents/skills}"
GSTACK_OFFICIAL="${HOME}/.claude/skills/gstack"

present() {
  local p
  for p in "$@"; do
    [[ -e "$p" ]] && return 0
  done
  return 1
}

row() {
  # status job engine belongs put command skip
  printf '| %s | %s | %s | `%s` | `%s` | %s |\n' "$1" "$2" "$3" "$4" "$5" "$6"
}

echo "# Missing / present engines"
echo
echo "Skill homes: npx → \`$SKILLS\`  vendor trees → \`$VENDOR\`"
echo "Never install into Agent OS. Skip → \`PORTABLE.md\`."
echo
echo "| Status | Job | Engine | Belongs in | Put files here | If skip |"
echo "|---|---|---|---|---|---|"

if present "$SKILLS/writing-plans/SKILL.md" "$SKILLS/brainstorming/SKILL.md"; then
  row "present" "Plan / brainstorm" "obra Superpowers" "$SKILLS" "npx skills add obra/superpowers -g -y" "—"
else
  row "MISSING" "Plan / brainstorm" "obra Superpowers" "$SKILLS" "npx skills add obra/superpowers -g -y" "Agent OS playbook"
fi

if present "$SKILLS/incremental-implementation/SKILL.md" "$SKILLS/idea-refine/SKILL.md"; then
  row "present" "Lifecycle / implement" "Addy agent-skills" "$SKILLS" "npx skills add addyosmani/agent-skills -g -y" "—"
else
  row "MISSING" "Lifecycle / implement" "Addy agent-skills" "$SKILLS" "npx skills add addyosmani/agent-skills -g -y" "ponytail + playbook"
fi

if present "$SKILLS/wayfinder/SKILL.md" \
  "$HOME/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/"*/skills/engineering/wayfinder/SKILL.md; then
  row "present" "Wayfinder / grilling / modules" "Matt Pocock" "$SKILLS (npx) or Claude plugin cache" "npx skills add mattpocock/skills -g -y" "—"
else
  row "MISSING" "Wayfinder / grilling / modules" "Matt Pocock" "$SKILLS" "npx skills add mattpocock/skills -g -y" "FROM-PRD + modules.md"
fi

if present "$GSTACK_OFFICIAL/setup" "$VENDOR/gstack/setup" "$VENDOR/gstack"; then
  row "present" "Review / QA / ship / browse" "gstack" "$VENDOR/gstack (clone + symlink)" "install-essentials gstack-clone" "PORTABLE review/ship; no fake canary"
else
  row "MISSING" "Review / QA / ship / browse" "gstack" "$VENDOR/gstack" "git clone …/gstack && ./setup --host auto" "PORTABLE.md review/ship"
fi

if present "$VENDOR/pstack/skills/arena/SKILL.md" \
  "$HOME/.cursor/plugins/cache/cursor-public/pstack/"*/skills/arena/SKILL.md; then
  row "present" "Arena / architect / how" "pstack files" "$VENDOR/pstack" "install-essentials pstack-vendor" "PORTABLE.md arena method"
else
  row "MISSING" "Arena / architect / how" "pstack files" "$VENDOR/pstack" "copy Cursor pstack slice or sparse clone cursor/plugins" "PORTABLE.md"
fi

if present "$HOME/.cursor/plugins/cache/cursor-public/pstack"; then
  row "present" "Arena Task + worktrees" "pstack Cursor plugin" "Cursor Plugins" "/add-plugin pstack" "PORTABLE.md (not the plugin)"
else
  row "MISSING" "Arena Task + worktrees" "pstack Cursor plugin" "Cursor only" "/add-plugin pstack" "PORTABLE.md — cannot fake Task models"
fi

echo
echo "Ask the human: install MISSING rows to these defaults / specify another folder / skip."
echo "Then: mkdir -p \"$SKILLS\" \"$VENDOR\" and run install-essentials.sh if they said yes."
echo "Record the home in docs/agents/skill-roots.local.md (gitignored)."
exit 0
