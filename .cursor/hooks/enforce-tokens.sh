#!/usr/bin/env bash
# PreToolUse hook — design-token gate.
#
# Denies hex colour literals (#aabbcc), rgb(), rgba(), raw px values, and
# Tailwind arbitrary values such as text-[14px], mt-[7px], bg-[#abc] in
# component/app code. Allows them in:
#   tokens/        — where they're defined
#   generated/     — output of Style Dictionary
#   theme files    — *theme*
#   test files     — *.test.* / *.spec.*
#   tailwind.config — utility framework config
#   dotfiles
#
# Only fires on component and app source files. Normalises Windows backslashes.
# Non-UI projects: this hook is always a no-op (no components/ or app/ dirs).

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

NORM="${FILE//\\//}"

# Allowlisted locations — pass through
case "$NORM" in
  tokens/*|*/tokens/*|generated/*|*/generated/*|*/theme*|.*|tailwind.config*|*.test.*|*.spec.*) exit 0 ;;
esac

# Only apply to component and app source
case "$NORM" in
  components/*|app/*|src/components/*|src/app/*|*/components/*|*/app/*) ;;
  *) exit 0 ;;
esac

if echo "$CONTENT" | grep -qE '#[0-9a-fA-F]{3,8}\b|rgba?\(|\b[0-9]+px\b|[A-Za-z0-9_-]+-\[[^]]+\]'; then
  jq -n --arg reason "Hex/rgb/pixel literals and Tailwind arbitrary values are forbidden in component code. Use semantic design tokens and approved scale utilities instead." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
