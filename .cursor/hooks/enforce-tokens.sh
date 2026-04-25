#!/usr/bin/env bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')
case "$FILE" in
  tokens/*|*/tokens/*|generated/*|*/generated/*|*/theme*|.*|tailwind.config*|*.test.*|*.spec.*) exit 0 ;;
esac
case "$FILE" in
  components/*|app/*|src/components/*|src/app/*|*/components/*|*/app/*) ;;
  *) exit 0 ;;
esac
if echo "$CONTENT" | grep -qE '#[0-9a-fA-F]{3,8}\b|rgba?\(|\b[0-9]+px\b'; then
  jq -n --arg reason "Hex/rgb/pixel literals forbidden in component code. Use semantic tokens from tokens/semantic/." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
