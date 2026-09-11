#!/usr/bin/env bash
# Ensure mock-core is listening on :4173. Starts it in the background if needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${MOCK_PORT:-4173}"

if curl -sf -m 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$ROOT/.scratch"
echo "[cua] starting mock on :${PORT} …" >&2
nohup node "$ROOT/scripts/serve-mock.mjs" >>"$ROOT/.scratch/mock-core.log" 2>&1 &
echo $! >"$ROOT/.scratch/mock-core.pid"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "[cua] mock ready" >&2
    exit 0
  fi
  sleep 0.5
done

echo "[cua] mock failed to start — try: npm run mock" >&2
exit 1
