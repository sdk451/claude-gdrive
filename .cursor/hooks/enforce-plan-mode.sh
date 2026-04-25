#!/usr/bin/env bash
# Design-before-code gate for story branches.
# When the branch contains a story id (e.g. TOK-6, AUTH-101), require
# docs/designs/{STORY_ID}.md to exist before allowing writes outside docs/ or
# tests/. Path matching is case-insensitive on the docs/tests prefix and
# normalises Windows backslashes so absolute paths from Cursor on Windows still
# match the allowlist (Cursor on macOS / CLI hand back POSIX paths and were
# already covered).
INPUT=$(cat)
BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && exit 0
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Normalize backslashes -> forward slashes so the suffix match works regardless
# of how the host reported the path.
NORM="${FILE//\\//}"
case "$NORM" in
  docs/*|tests/*|*/docs/*|*/tests/*) exit 0 ;;
esac

if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No docs/designs/${STORY_ID}.md exists. Run the Planner agent first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
