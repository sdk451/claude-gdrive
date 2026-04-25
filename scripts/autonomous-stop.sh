#!/usr/bin/env bash
# Stop autonomous mode for the current story.
#
# Usage: scripts/autonomous-stop.sh
#
# Removes `.cursor/autonomous-mode.txt`. After this, the linear-sync stop-hook
# is silent and implementer commits no longer push / PR / advance Linear status.
# Idempotent — running with no marker is a no-op.

set -euo pipefail

FILE=".cursor/autonomous-mode.txt"
if [ -f "$FILE" ]; then
  STORY=$(head -n 1 "$FILE" 2>/dev/null || echo "?")
  rm -f "$FILE"
  echo "autonomous-mode: OFF · cleared marker for story=$STORY"
else
  echo "autonomous-mode: already OFF"
fi
