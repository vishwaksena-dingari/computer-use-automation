#!/usr/bin/env bash
# Adopt Agent OS into a target repo (files only — does not install Claude plugins).
# Usage: bash adopt-project.sh /path/to/repo [project-slug]
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

REPO="${1:?Usage: adopt-project.sh /path/to/repo [slug]}"
SLUG="${2:-$(basename "$REPO" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')}"

# shellcheck source=paths.sh
source "$(cd "$(dirname "$0")" && pwd)/paths.sh"
HERE="${AGENT_OS_HOME:?Cannot find Agent OS kit (set AGENT_OS_HOME)}"

if [[ ! -f "$HERE/FROM-PRD.md" && ! -f "$HERE/references/from-prd.md" ]]; then
  echo "Cannot find Agent OS kit at HERE=$HERE" >&2
  exit 1
fi

mkdir -p "$REPO/agent-os/TEMPLATES" "$REPO/docs/agents" "$REPO/docs/adr" "$REPO/.scratch/$SLUG/issues"

if [[ -f "$HERE/FROM-PRD.md" ]]; then
  cp "$HERE/FROM-PRD.md" "$HERE/PLAYBOOK.md" "$HERE/TOOLING.md" "$HERE/BUNDLE.md" "$HERE/README.md" "$REPO/agent-os/" 2>/dev/null || true
  [[ -f "$HERE/SETUP.md" ]] && cp "$HERE/SETUP.md" "$REPO/agent-os/"
  [[ -f "$HERE/skill-catalog.md" ]] && cp "$HERE/skill-catalog.md" "$REPO/agent-os/"
  [[ -f "$HERE/references/skill-catalog.md" ]] && cp "$HERE/references/skill-catalog.md" "$REPO/agent-os/skill-catalog.md"
  mkdir -p "$REPO/agent-os/scripts"
  cp "$HERE/scripts/"*.sh "$REPO/agent-os/scripts/" 2>/dev/null || true
  cp "$HERE/TEMPLATES/"* "$REPO/agent-os/TEMPLATES/"
else
  cp "$HERE/references/from-prd.md" "$REPO/agent-os/FROM-PRD.md"
  cp "$HERE/references/playbook.md" "$REPO/agent-os/PLAYBOOK.md"
  cp "$HERE/references/tooling.md" "$REPO/agent-os/TOOLING.md"
  cp "$HERE/references/bundle.md" "$REPO/agent-os/BUNDLE.md"
  [[ -f "$HERE/references/setup.md" ]] && cp "$HERE/references/setup.md" "$REPO/agent-os/SETUP.md"
  [[ -f "$HERE/references/skill-catalog.md" ]] && cp "$HERE/references/skill-catalog.md" "$REPO/agent-os/skill-catalog.md"
  cp "$HERE/README.md" "$REPO/agent-os/"
  mkdir -p "$REPO/agent-os/scripts"
  cp "$HERE/scripts/"*.sh "$REPO/agent-os/scripts/" 2>/dev/null || true
  cp "$HERE/assets/templates/"* "$REPO/agent-os/TEMPLATES/"
fi

T="$REPO/agent-os/TEMPLATES"
seed() { [[ -f "$2" ]] || cp "$1" "$2"; }

seed "$T/CONTEXT.md" "$REPO/CONTEXT.md"
seed "$T/DECISIONS.md" "$REPO/DECISIONS.md"
seed "$T/CLAUDE.md" "$REPO/CLAUDE.md"
seed "$T/map.md" "$REPO/.scratch/$SLUG/map.md"
seed "$T/issue-tracker.md" "$REPO/docs/agents/issue-tracker.md"
seed "$T/triage-labels.md" "$REPO/docs/agents/triage-labels.md"
seed "$T/domain.md" "$REPO/docs/agents/domain.md"
seed "$T/skills-playbook.overlay.md" "$REPO/docs/agents/skills-playbook.md"
seed "$T/tooling-ready.md" "$REPO/docs/agents/tooling-ready.md"
seed "$T/ARCHITECTURE.stub.md" "$REPO/docs/ARCHITECTURE.md"
seed "$T/setup-answers.md" "$REPO/.scratch/$SLUG/setup-answers.md"

touch "$REPO/.gitignore"
if ! grep -q '^\.env$' "$REPO/.gitignore" 2>/dev/null; then
  printf '\n# Agent OS — secrets\n.env\n.env.*\n!.env.example\n' >> "$REPO/.gitignore"
fi

echo "Adopted Agent OS into $REPO (slug=$SLUG)"
echo "Next: Agent OS: setup this project — or FROM-PRD / idea intake."
echo "Live Claude skill: cp -R \"\${AGENT_OS_HOME:-.}\" ~/.claude/skills/agent-os"
