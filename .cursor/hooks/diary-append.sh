#!/usr/bin/env bash
INPUT=$(cat)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MONTH=$(date -u +"%Y-%m")
TODAY=$(date -u +"%Y-%m-%d")
DIR="docs/diary/${MONTH}"
DIARY_FILE="${DIR}/${TODAY}.md"
mkdir -p "$DIR"
[ ! -f "$DIARY_FILE" ] && { echo "# Diary — $TODAY"; echo ""; } > "$DIARY_FILE"
PERSONA="${CLAUDE_AGENT_NAME:-${CURSOR_AGENT_NAME:-${CLINE_AGENT_NAME:-unknown}}}"
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .hook_event_name // "start"')
BRANCH=$(git branch --show-current 2>/dev/null || echo "-")
STORY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')
case "$HOOK_EVENT" in
  sessionStart|SessionStart) echo "- ${NOW} | ${PERSONA} | [start] branch=${BRANCH} story=${STORY}" >> "$DIARY_FILE" ;;
  postToolUse|PostToolUse)
    if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "Bash" || "$TOOL" == "Shell" ]]; then
      FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
      CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | head -c 80)
      SUMMARY="${FILE_PATH:-$CMD}"
      echo "- ${NOW} | ${PERSONA} | ${TOOL} | ${SUMMARY}" >> "$DIARY_FILE"
    fi ;;
  stop|Stop) echo "- ${NOW} | ${PERSONA} | [stop] branch=${BRANCH}" >> "$DIARY_FILE" ;;
esac
exit 0
