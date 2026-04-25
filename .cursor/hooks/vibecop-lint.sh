#!/usr/bin/env bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
EXT="${FILE##*.}"
command -v vibecop >/dev/null && vibecop check "$FILE" 2>&1 | head -20
case "$EXT" in
  js|jsx|ts|tsx|json|css|md)
    npx prettier --write "$FILE" 2>/dev/null
    npx eslint --fix "$FILE" 2>/dev/null ;;
  py) ruff check --fix "$FILE" 2>/dev/null; ruff format "$FILE" 2>/dev/null ;;
  go) gofmt -w "$FILE" 2>/dev/null ;;
  rs) rustfmt "$FILE" 2>/dev/null ;;
esac
exit 0
