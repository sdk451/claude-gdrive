#!/usr/bin/env bash
# PostToolUse + Stop hook: send coding/session history to Memori BYODB.
# Memori BYODB is SDK-backed, so this hook delegates to scripts/memori-session.py.

set -euo pipefail

INPUT="$(cat)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# On Windows, App Execution Aliases put a stub python3.exe on PATH that only
# prints "Python was not found..." and exits non-zero. `command -v` finds it,
# so probe for an interpreter that actually runs before committing to it.
pick_python() {
  if [ -n "${PYTHON:-}" ]; then
    printf '%s' "$PYTHON"
    return 0
  fi
  for cand in python3 python py; do
    command -v "$cand" >/dev/null 2>&1 || continue
    case "$(command -v "$cand")" in
      */WindowsApps/*) continue ;;
    esac
    "$cand" -c 'import sys' >/dev/null 2>&1 || continue
    printf '%s' "$cand"
    return 0
  done
  return 1
}

PY="$(pick_python)" || {
  echo "memori-session: no working python interpreter on PATH; skipping" >&2
  exit 0
}

printf '%s' "$INPUT" | "$PY" "$ROOT/scripts/memori-session.py" --stdin-json || true

