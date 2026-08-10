#!/usr/bin/env bash
# PreToolUse hook — blocks destructive shell commands before they run.
# Fires on every Shell/Bash tool call. Silent (exit 0) when safe.
#
# Blocked patterns:
#   rm -rf /            — recursive delete from root
#   git push --force ... main  — force-push to main
#   git push -f ... main       — force-push to main (shorthand)
#   :(){:|:&};:         — fork bomb

INPUT=$(cat)

# Fail open: missing jq must not block the autonomous shell loop (common on fresh macOS).
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

DANGER='rm\s+-rf\s+/|git push\s+.*--force.*\smain|git push\s+.*-f.*\smain|:\(\)\{:\|:&\};:'

if echo "$CMD" | grep -qE "$DANGER"; then
  jq -n --arg reason "Blocked destructive command: $CMD" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
