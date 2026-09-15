#!/usr/bin/env bash
# Adopt Agent OS into a target repo (files). Optional: --install / --install-extras.
# Usage: bash adopt-project.sh /path/to/repo [project-slug] [--install|--install-extras]
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

REPO=""
SLUG=""
DO_INSTALL=""
for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL="essentials" ;;
    --install-extras) DO_INSTALL="extras" ;;
    --*)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
    *)
      if [[ -z "$REPO" ]]; then
        REPO="$arg"
      elif [[ -z "$SLUG" ]]; then
        SLUG="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        exit 2
      fi
      ;;
  esac
done
REPO="${REPO:?Usage: adopt-project.sh /path/to/repo [slug] [--install|--install-extras]}"
SLUG="${SLUG:-$(basename "$REPO" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')}"

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
  [[ -f "$HERE/FACTORY.md" ]] && cp "$HERE/FACTORY.md" "$REPO/agent-os/"
  [[ -f "$HERE/MODULES.md" ]] && cp "$HERE/MODULES.md" "$REPO/agent-os/"
  [[ -f "$HERE/DUAL-SKILL.md" ]] && cp "$HERE/DUAL-SKILL.md" "$REPO/agent-os/"
  [[ -f "$HERE/CAPABILITIES.md" ]] && cp "$HERE/CAPABILITIES.md" "$REPO/agent-os/"
  [[ -f "$HERE/references/capabilities.md" ]] && cp "$HERE/references/capabilities.md" "$REPO/agent-os/CAPABILITIES.md"
  [[ -f "$HERE/PORTABLE.md" ]] && cp "$HERE/PORTABLE.md" "$REPO/agent-os/"
  [[ -f "$HERE/references/portable.md" ]] && cp "$HERE/references/portable.md" "$REPO/agent-os/PORTABLE.md"
  [[ -f "$HERE/SKILL-ROOTS.md" ]] && cp "$HERE/SKILL-ROOTS.md" "$REPO/agent-os/"
  [[ -f "$HERE/references/skill-roots.md" ]] && cp "$HERE/references/skill-roots.md" "$REPO/agent-os/SKILL-ROOTS.md"
  [[ -f "$HERE/skill-catalog.md" ]] && cp "$HERE/skill-catalog.md" "$REPO/agent-os/"
  [[ -f "$HERE/references/skill-catalog.md" ]] && cp "$HERE/references/skill-catalog.md" "$REPO/agent-os/skill-catalog.md"
  mkdir -p "$REPO/agent-os/scripts"
  cp "$HERE/scripts/"*.sh "$REPO/agent-os/scripts/" 2>/dev/null || true
  cp "$HERE/scripts/"*.tsv "$REPO/agent-os/scripts/" 2>/dev/null || true
  cp "$HERE/TEMPLATES/"* "$REPO/agent-os/TEMPLATES/"
else
  cp "$HERE/references/from-prd.md" "$REPO/agent-os/FROM-PRD.md"
  cp "$HERE/references/playbook.md" "$REPO/agent-os/PLAYBOOK.md"
  cp "$HERE/references/tooling.md" "$REPO/agent-os/TOOLING.md"
  cp "$HERE/references/bundle.md" "$REPO/agent-os/BUNDLE.md"
  [[ -f "$HERE/references/setup.md" ]] && cp "$HERE/references/setup.md" "$REPO/agent-os/SETUP.md"
  [[ -f "$HERE/references/factory.md" ]] && cp "$HERE/references/factory.md" "$REPO/agent-os/FACTORY.md"
  [[ -f "$HERE/references/modules.md" ]] && cp "$HERE/references/modules.md" "$REPO/agent-os/MODULES.md"
  [[ -f "$HERE/references/dual-skill.md" ]] && cp "$HERE/references/dual-skill.md" "$REPO/agent-os/DUAL-SKILL.md"
  [[ -f "$HERE/references/capabilities.md" ]] && cp "$HERE/references/capabilities.md" "$REPO/agent-os/CAPABILITIES.md"
  [[ -f "$HERE/references/portable.md" ]] && cp "$HERE/references/portable.md" "$REPO/agent-os/PORTABLE.md"
  [[ -f "$HERE/references/skill-roots.md" ]] && cp "$HERE/references/skill-roots.md" "$REPO/agent-os/SKILL-ROOTS.md"
  [[ -f "$HERE/references/skill-catalog.md" ]] && cp "$HERE/references/skill-catalog.md" "$REPO/agent-os/skill-catalog.md"
  cp "$HERE/README.md" "$REPO/agent-os/"
  mkdir -p "$REPO/agent-os/scripts"
  cp "$HERE/scripts/"*.sh "$REPO/agent-os/scripts/" 2>/dev/null || true
  cp "$HERE/scripts/"*.tsv "$REPO/agent-os/scripts/" 2>/dev/null || true
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
seed "$T/skill-roots.local.md" "$REPO/docs/agents/skill-roots.local.md"
seed "$T/ARCHITECTURE.stub.md" "$REPO/docs/ARCHITECTURE.md"
seed "$T/setup-answers.md" "$REPO/.scratch/$SLUG/setup-answers.md"
seed "$T/factory-gate.md" "$REPO/.scratch/$SLUG/factory-gate.md"
seed "$T/modules.md" "$REPO/docs/agents/modules.md"
seed "$T/module-index.md" "$REPO/docs/agents/module-index.md"

touch "$REPO/.gitignore"
if ! grep -q '^\.env$' "$REPO/.gitignore" 2>/dev/null; then
  printf '\n# Agent OS — secrets\n.env\n.env.*\n!.env.example\n' >> "$REPO/.gitignore"
fi

if ! grep -q 'skill-roots.local.md' "$REPO/.gitignore" 2>/dev/null; then
  printf '\n# Agent OS — machine-local pointers\ndocs/agents/*.local.md\n' >> "$REPO/.gitignore"
fi

echo "Adopted Agent OS into $REPO (slug=$SLUG)"
if [[ "$DO_INSTALL" == "extras" ]]; then
  bash "$HERE/scripts/install-essentials.sh" --extras || echo "WARN: pack install had failures (non-blocking)"
elif [[ "$DO_INSTALL" == "essentials" ]]; then
  bash "$HERE/scripts/install-essentials.sh" || echo "WARN: pack install had failures (non-blocking)"
else
  echo "Packs: bash \"${HERE}/scripts/install-essentials.sh\"   # or --extras"
fi
echo "Next: Agent OS: setup this project — or FROM-PRD / idea intake."
echo "Live Claude skill: cp -R \"\${AGENT_OS_HOME:-.}\" ~/.claude/skills/agent-os"
