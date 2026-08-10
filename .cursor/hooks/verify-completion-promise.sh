#!/usr/bin/env bash
# Stop hook — require STORY_COMPLETE + passing targeted test suite.
#
# Only active on story branches (branch name contains a story ID like E1-S3).
# Checks .cursor/scratchpad.md for the STORY_COMPLETE promise.
# If promise found, runs scripts/run-targeted-tests.sh with the story's
# targets file. If tests pass → silent exit (done). If not → followup_message.
#
# Caps at MAX_LOOPS to prevent infinite nudging.

INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
MAX=30
if [ "$LOOP" -ge "$MAX" ]; then echo '{}'; exit 0; fi

BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && echo '{}' && exit 0

# Support both legacy story-id formats (TOK-6) and new format (E1-S3)
TARGETS_FILE="docs/tests/${STORY_ID}-targets.txt"
SCRATCH=".cursor/scratchpad.md"

if grep -q "STORY_COMPLETE" "$SCRATCH" 2>/dev/null; then
  if [ -f "$TARGETS_FILE" ]; then
    if ./scripts/run-targeted-tests.sh "$TARGETS_FILE"; then
      echo '{}'; exit 0
    fi
  else
    # No targets file yet — pass through (test-architect hasn't run yet)
    echo '{}'; exit 0
  fi
fi

jq -n --arg msg "Iteration $((LOOP+1))/${MAX}. All targeted tests in ${TARGETS_FILE} must pass. Emit <promise>STORY_COMPLETE</promise> only when every test is green." \
  '{followup_message: $msg}'
