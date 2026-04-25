#!/usr/bin/env bash
# Stop hook — require STORY_COMPLETE + passing TARGETED test suite
# The targeted suite is defined in docs/tests/{story-id}-targets.txt
# (one test path or pattern per line). Test Architect writes it.

INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
MAX=30
if [ "$LOOP" -ge "$MAX" ]; then echo '{}'; exit 0; fi

BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && echo '{}' && exit 0
TARGETS_FILE="docs/tests/${STORY_ID}-targets.txt"
SCRATCH=".cursor/scratchpad.md"

if grep -q "STORY_COMPLETE" "$SCRATCH" 2>/dev/null; then
  # Run the targeted suite defined by Test Architect
  if [ -f "$TARGETS_FILE" ]; then
    # Invoke the unified test runner (installed in 2.10)
    if ./scripts/run-targeted-tests.sh "$TARGETS_FILE"; then
      echo '{}'; exit 0
    fi
  else
    # Fall back to the full affected suite
    if pnpm test --run 2>/dev/null; then echo '{}'; exit 0; fi
  fi
fi

jq -n --arg msg "Iteration $((LOOP+1))/$MAX. Targeted tests from ${TARGETS_FILE} must all pass. Emit <promise>STORY_COMPLETE</promise> only when every one is green." \
  '{followup_message: $msg}'
