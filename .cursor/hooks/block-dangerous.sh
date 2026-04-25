#!/usr/bin/env bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
DANGER='rm\s+-rf\s+/|git push\s+.*--force.*\smain|git push\s+.*-f.*\smain|:(){:|:&};:'
if echo "$CMD" | grep -qE "$DANGER"; then
  jq -n --arg reason "Blocked destructive command: $CMD" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
