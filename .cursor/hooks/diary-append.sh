#!/usr/bin/env bash
# Throttled diary.
# Records:
#   1. Stop event: materialise .cursor/session-summary.md (if non-empty) into
#      today's diary as a timestamped block, then clear the source file. Silent
#      when no summary exists — the agent owns when to write one (see rule
#      42-diary.mdc).
#   2. PostToolUse: significant updates to foundational documents (Write/Edit
#      on docs that define project intent: brief, prd, architecture, tech-stack,
#      ux*, constitution, backlog, design-system, environments, observability,
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
  # Normalize backslashes -> forward slashes so we can match against the
  # repo-relative `docs/...` suffix regardless of how the caller (Cursor on
  # Windows, Cursor on macOS, CLI, etc.) reports the path.
  local n="${p//\\//}"
  case "$n" in
    *docs/brief.md|*docs/prd.md|*docs/architecture.md|*docs/tech-stack.md|\
*docs/constitution.md|*docs/ux.md|*docs/ux-principles.md|*docs/backlog.md|\
*docs/design-system.md|*docs/environments.md|*docs/observability.md|\
*docs/test-strategy.md) ;;
    *docs/designs/*) ;;
    *docs/_seed/*) ;;
    *) return 1 ;;
  esac
  # Exclude diary files just in case they ever land under a matched glob.
  case "$n" in
    *docs/diary/*) return 1 ;;
  esac
  return 0
}

append_entry() {
  mkdir -p "$DIR"
  [ ! -f "$DIARY_FILE" ] && printf '# Diary — %s\n\n' "$TODAY" > "$DIARY_FILE"
  echo "$1" >> "$DIARY_FILE"
}

case "$HOOK_EVENT" in
  stop|Stop)
    SUMMARY=".cursor/session-summary.md"
    # Only write a diary block when the agent has actually authored a summary.
    # No more `[session-end]` stub lines on every turn — those were noise and
    # the original complaint that drove this rewrite.
    #
    # Robustness: require non-whitespace content (after stripping a possible
    # UTF-8 BOM) so a zero-byte or whitespace-only or BOM-only file produced
    # by editors / PowerShell / accidental `: > $SUMMARY` does NOT materialise
    # an empty block.
    if [ -f "$SUMMARY" ]; then
      HAS_CONTENT=$(sed $'1s/^\xef\xbb\xbf//' "$SUMMARY" 2>/dev/null | tr -d '[:space:]')
      if [ -n "$HAS_CONTENT" ]; then
        mkdir -p "$DIR"
        [ ! -f "$DIARY_FILE" ] && printf '# Diary — %s\n\n' "$TODAY" > "$DIARY_FILE"
        # Hook owns the H2 section level. Heading is the timestamp itself —
        # readers can scan a diary day and see the time of every entry as the
        # first text on each H2 line. Metadata (persona / branch / story) goes
        # on a subdued italic line directly below so the heading stays clean.
        # Agent-authored content is demoted by one heading level (sed adds a
        # leading `#` to any line starting with 1..5 `#`s) to keep the H2 unique
        # and let H1/H2/H3 inside the summary nest correctly under the date.
        {
          printf '\n## %s\n\n_session-summary · persona %s · branch %s · story %s_\n\n' \
            "$NOW" "$PERSONA" "$BRANCH" "${STORY:-none}"
          sed -E -e $'1s/^\xef\xbb\xbf//' -e 's/^(#{1,5}) /\1# /' "$SUMMARY"
          printf '\n'
        } >> "$DIARY_FILE"
        : > "$SUMMARY"
      fi
    fi
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
