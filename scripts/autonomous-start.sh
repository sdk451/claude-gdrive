#!/usr/bin/env bash
# Start autonomous mode for a story.
#
# Usage:
#   scripts/autonomous-start.sh <STORY_ID> [mode]
#
#   STORY_ID  e.g. TOK-6 — the Linear identifier for the work being done
#   mode      optional, default `full`. Reserved for future variants
#             (`full` = commit + push + PR + auto-merge + status update;
#              `branch-only` = commit + push, no PR;
#              `dry-run`     = enable Linear comments but skip push/PR/status).
#
# Effect:
#   - Writes `.cursor/autonomous-mode.txt` with `<STORY_ID>\n<mode>\n<iso-time>`.
#   - The linear-sync-prompt stop-hook reads this file and only nudges when it
#     exists AND its first STORY_ID matches the current branch.
#   - Implementer behaviour is gated on the same file (see
#     .cursor/rules/12-autonomous-mode.mdc).
#
# Idempotent: overwrites any existing marker.

set -euo pipefail

STORY="${1:-}"
MODE="${2:-full}"

if [ -z "$STORY" ]; then
  echo "usage: $0 <STORY_ID> [mode]" >&2
  exit 2
fi

if ! echo "$STORY" | grep -qE '^[A-Z]+-[0-9]+$'; then
  echo "error: STORY_ID must look like ABC-123 (got '$STORY')" >&2
  exit 2
fi

case "$MODE" in
  full|branch-only|dry-run) ;;
  *) echo "error: mode must be one of full|branch-only|dry-run (got '$MODE')" >&2; exit 2 ;;
esac

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p .cursor
{
  printf '%s\n' "$STORY"
  printf '%s\n' "$MODE"
  printf '%s\n' "$NOW"
} > .cursor/autonomous-mode.txt

echo "autonomous-mode: ON · story=$STORY · mode=$MODE · started=$NOW"
