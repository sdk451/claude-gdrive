#!/usr/bin/env bash
# PostToolUse hook — auto-lint and format on Write/Edit.
#
# Runs on every file save. In order:
#   1. vibecop check (if installed) — AI-powered style guard
#   2. Formatter + linter for the file's language:
#      JS/TS/JSON/CSS/MD → prettier + eslint
#      Python            → ruff check + ruff format
#      Go                → gofmt
#      Rust              → rustfmt
#
# Silent when the tool isn't installed (never blocks the agent).
# Always exits 0 — lint findings are informational, not blocking.

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0

EXT="${FILE##*.}"

# vibecop — run if available
if command -v vibecop >/dev/null 2>&1; then
  vibecop check "$FILE" 2>&1 | head -20 || true
fi

# Language-specific formatter + linter
case "$EXT" in
  js|jsx|ts|tsx|json|css|md|mdx)
    # Prettier first (formatting), then ESLint (style rules)
    if command -v npx >/dev/null 2>&1; then
      npx --yes prettier --write "$FILE" 2>/dev/null || true
      npx --yes eslint --fix "$FILE" 2>/dev/null || true
    fi
    ;;
  py)
    if command -v ruff >/dev/null 2>&1; then
      ruff check --fix "$FILE" 2>/dev/null || true
      ruff format "$FILE" 2>/dev/null || true
    fi
    ;;
  go)
    if command -v gofmt >/dev/null 2>&1; then
      gofmt -w "$FILE" 2>/dev/null || true
    fi
    ;;
  rs)
    if command -v rustfmt >/dev/null 2>&1; then
      rustfmt "$FILE" 2>/dev/null || true
    fi
    ;;
esac

exit 0
