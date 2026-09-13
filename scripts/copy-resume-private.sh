#!/usr/bin/env bash
# Copy a resume PDF into gitignored .private/ for path-jailed apply uploads.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "usage: $0 /path/to/resume.pdf" >&2
  exit 1
fi
mkdir -p "$ROOT/.private"
cp "$SRC" "$ROOT/.private/resume.pdf"
echo "Copied → .private/resume.pdf"
echo 'Set in profile JSON:  "resumePath": ".private/resume.pdf"'
