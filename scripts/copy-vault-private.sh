#!/usr/bin/env bash
# Copy career-data vault profile (+ optional resume) into gitignored .private/ for cua apply.
# Path jail requires files under the interface-ai repo; normalizeApplyProfile reads vault keys as-is.
# Letter B: --vault-root resolves relative PROFILE/RESUME under career-data before copy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_SRC=""
RESUME_SRC=""
VAULT_ROOT=""

usage() {
  echo "usage: $0 [--vault-root DIR] /path/to/apply-profile.json [/path/to/resume.pdf]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-root)
      VAULT_ROOT="${2:-}"
      shift 2
      ;;
    -h|--help) usage ;;
    *)
      if [[ -z "$PROFILE_SRC" ]]; then
        PROFILE_SRC="$1"
      elif [[ -z "$RESUME_SRC" ]]; then
        RESUME_SRC="$1"
      else
        usage
      fi
      shift
      ;;
  esac
done

resolve_src() {
  local p="$1"
  if [[ -z "$p" ]]; then
    echo ""
    return
  fi
  if [[ "$p" = /* ]]; then
    echo "$p"
    return
  fi
  if [[ -n "$VAULT_ROOT" ]]; then
    echo "$VAULT_ROOT/$p"
    return
  fi
  echo "$p"
}

PROFILE_SRC="$(resolve_src "$PROFILE_SRC")"
RESUME_SRC="$(resolve_src "$RESUME_SRC")"

if [[ -z "$PROFILE_SRC" || ! -f "$PROFILE_SRC" ]]; then
  echo "usage: $0 [--vault-root DIR] /path/to/apply-profile.json [/path/to/resume.pdf]" >&2
  exit 1
fi
umask 077
mkdir -p "$ROOT/.private"
cp "$PROFILE_SRC" "$ROOT/.private/profile.json"
chmod 600 "$ROOT/.private/profile.json" 2>/dev/null || true
echo "Copied profile → .private/profile.json"
if [[ -n "$RESUME_SRC" ]]; then
  if [[ ! -f "$RESUME_SRC" ]]; then
    echo "resume not found: $RESUME_SRC" >&2
    exit 1
  fi
  cp "$RESUME_SRC" "$ROOT/.private/resume.pdf"
  echo "Copied resume → .private/resume.pdf"
fi
# Always point resumePath at the jailed copy when present (T-B-26 / T-W-12).
if [[ -f "$ROOT/.private/resume.pdf" ]]; then
  python3 - "$ROOT/.private/profile.json" <<'PY'
import json, os, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
data["resumePath"] = ".private/resume.pdf"
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
print("Set resumePath → .private/resume.pdf")
PY
fi
if [[ -n "$VAULT_ROOT" ]]; then
  echo "vault-root: $VAULT_ROOT"
fi
echo "Next: ./scripts/apply-live.sh --url \"\$APPLY_URL\" --headed --escalate"
# Or: npx cua apply --claim-json .private/claim.json
