#!/usr/bin/env bash
# Resolve AGENT_OS_HOME / CLAUDE_SKILLS_ROOT without hardcoding usernames or fixed home paths.
# Sourced by other scripts; safe to source from docs examples.

_agent_os_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

# Kit root = directory that contains FROM-PRD.md or references/from-prd.md
if [[ -z "${AGENT_OS_HOME:-}" ]]; then
  if [[ -f "$_agent_os_here/FROM-PRD.md" || -f "$_agent_os_here/references/from-prd.md" ]]; then
    export AGENT_OS_HOME="$_agent_os_here"
  fi
fi

# Library root = parent of skills/ when kit lives at skills/agent-os
if [[ -z "${CLAUDE_SKILLS_ROOT:-}" && -n "${AGENT_OS_HOME:-}" ]]; then
  _parent="$(dirname "$AGENT_OS_HOME")"
  _grand="$(dirname "$_parent")"
  if [[ "$(basename "$_parent")" == "skills" ]]; then
    export CLAUDE_SKILLS_ROOT="$_grand"
  fi
fi

# Live install (Claude Code)
export AGENT_OS_LIVE="${AGENT_OS_LIVE:-$HOME/.claude/skills/agent-os}"
