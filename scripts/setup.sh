#!/usr/bin/env bash
# One-time local setup: deps + Playwright Chromium + .env skeleton.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm install"
npm install

echo "==> Playwright Chromium (user cache)"
# Avoid Cursor/sandbox browser paths so a normal terminal can run demos.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
if [[ "$(uname -s)" == "Linux" ]]; then
  export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
fi
npx playwright install chromium

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> wrote .env from .env.example (edit secrets locally; never commit)"
else
  echo "==> .env already present"
fi

echo "==> build"
npm run build

echo ""
echo "Ready. Next:"
echo "  npm run mock                 # terminal 1"
echo "  ./scripts/train.sh           # discover → save capability"
echo "  ./scripts/run.sh M-10042     # happy replay"
echo "  ./scripts/run.sh M-99999     # not-found outcome"
echo "  CUA_LOG=debug ./scripts/run.sh M-10042   # step breadcrumbs on stderr"
echo "  # or: docker compose up mock   /   docker compose run --rm cua"
