#!/usr/bin/env bash
# PreToolUse hook — design-before-code gate.
#
# On any Write/Edit to production code on a story branch, requires
# docs/designs/<STORY_ID>.md to exist first. Allows writes inside
# docs/, tests/, project/ and .cursor/ freely.
#
# Normalises Windows backslashes so the path check works on all OSes.

INPUT=$(cat)
BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && exit 0

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
NORM="${FILE//\\//}"

# Allow writes to docs, tests, project management files, and kit config
case "$NORM" in
  docs/*|tests/*|project/*|.cursor/*|.claude/*|*/docs/*|*/tests/*) exit 0 ;;
esac

if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No docs/designs/${STORY_ID}.md exists. Invoke the Planner agent first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
