#!/usr/bin/env bash
# Throttled diary.
# Records:
#   1. End-of-session/workflow summaries (stop / Stop event).
#   2. Significant updates to foundational documents (Write/Edit on docs that
#      define project intent: brief, prd, architecture, tech-stack, ux*,
#      constitution, backlog, design-system, environments, observability,
#      test-strategy, and per-story design docs under docs/designs/).
# Routine Shell/Bash activity and writes to non-foundational files are ignored.

INPUT=$(cat)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MONTH=$(date -u +"%Y-%m")
TODAY=$(date -u +"%Y-%m-%d")
DIR="docs/diary/${MONTH}"
DIARY_FILE="${DIR}/${TODAY}.md"

PERSONA="${CLAUDE_AGENT_NAME:-${CURSOR_AGENT_NAME:-${CLINE_AGENT_NAME:-unknown}}}"
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .hook_event_name // "start"')
BRANCH=$(git branch --show-current 2>/dev/null || echo "-")
STORY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')

is_significant_path() {
  local p="$1"
  [ -z "$p" ] && return 1
  case "$p" in
    docs/brief.md|docs/prd.md|docs/architecture.md|docs/tech-stack.md|\
docs/constitution.md|docs/ux.md|docs/ux-principles.md|docs/backlog.md|\
docs/design-system.md|docs/environments.md|docs/observability.md|\
docs/test-strategy.md) return 0 ;;
    docs/designs/*) return 0 ;;
    docs/_seed/*) return 0 ;;
    *) return 1 ;;
  esac
}

append_entry() {
  mkdir -p "$DIR"
  [ ! -f "$DIARY_FILE" ] && printf '# Diary — %s\n\n' "$TODAY" > "$DIARY_FILE"
  echo "$1" >> "$DIARY_FILE"
}

case "$HOOK_EVENT" in
  stop|Stop)
    append_entry "- ${NOW} | ${PERSONA} | [session-end] branch=${BRANCH} story=${STORY:-none}"
    ;;
  postToolUse|PostToolUse)
    case "$TOOL" in
      Write|Edit)
        FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
        if is_significant_path "$FILE_PATH"; then
          append_entry "- ${NOW} | ${PERSONA} | foundation-doc-update | ${FILE_PATH}"
        fi
        ;;
      *) ;;
    esac
    ;;
  *) ;;
esac

exit 0
