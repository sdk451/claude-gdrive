#!/usr/bin/env bash
INPUT=$(cat)
BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && exit 0
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
case "$FILE" in docs/*|tests/*|*/docs/*|*/tests/*) exit 0 ;; esac
if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No docs/designs/${STORY_ID}.md exists. Run the Planner agent first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
