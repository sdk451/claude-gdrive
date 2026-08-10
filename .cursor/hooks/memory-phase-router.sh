#!/usr/bin/env bash
# PreToolUse hook: route memory/context tools by phase.
#
# v7 distinctions:
# - Plan/design/discovery: Graphify before raw Grep/Glob.
# - Implementation/code edits: Serena before raw code reads/searches/edits.
# - Session outcomes: Memori via post-tool/stop hook, not here.
#
# This hook is advisory by default. It sends an agent_message so the model can
# correct course without blocking legitimate fallbacks.

INPUT="$(cat)"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // .tool // .name // ""' 2>/dev/null)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .path // ""' 2>/dev/null)"
QUERY="$(printf '%s' "$INPUT" | jq -r '.tool_input.query // .tool_input.pattern // .tool_input.command // ""' 2>/dev/null)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"
STORY="$(printf '%s' "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)"

norm="${FILE//\\//}"
msg=""

is_code_path() {
  case "$norm" in
    *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.java|*.kt|*.kts|*.cs|*.cpp|*.cc|*.c|*.h|*.hpp|*.rb|*.php|*.swift|*.scala|*.ex|*.exs) return 0 ;;
    src/*|app/*|lib/*|packages/*/src/*|services/*/src/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_design_path() {
  case "$norm" in
    docs/designs/*|docs/architecture.md|docs/tech-stack.md|docs/constitution.md|docs/test-strategy.md|project/requirements/*) return 0 ;;
    *) return 1 ;;
  esac
}

graph_exists=false
if [ -f graphify-out/GRAPH_REPORT.md ] || [ -f graphify-out/graph.json ]; then
  graph_exists=true
fi

case "$TOOL" in
  Grep|Glob)
    if $graph_exists; then
      if [ -z "$STORY" ] || is_design_path || printf '%s' "$QUERY" | grep -qiE 'architect|design|plan|where|component|module|flow|dependency|domain|ownership'; then
        msg="planning/design discovery must use Graphify first: read graphify-out/GRAPH_REPORT.md, then use graphify query/path/explain. Use Grep/Glob only after Graphify cannot identify a target."
      else
        msg="implementation discovery should use Serena symbol tools before raw $TOOL for code. Use get_symbols_overview/find_symbol/find_referencing_symbols; fall back only if Serena cannot resolve it."
      fi
    fi
    ;;
  Read)
    if is_code_path; then
      msg="before reading code files for implementation, use Serena get_symbols_overview/find_symbol so the LSP supplies precise coordinates. Plain Read is OK for small files, docs, config, or Serena failures."
    fi
    ;;
  Write|Edit|MultiEdit)
    if is_code_path; then
      msg="before editing code, verify the target with Serena LSP tools (find_symbol/references, then symbol-scoped edit when available). After meaningful work, write lessons/fixes/patterns to .cursor/session-summary.md for Memori."
    elif is_design_path; then
      msg="before changing designs/requirements, review Graphify for architecture context. After the design decision, write a concise Memori session summary with patterns and lessons learned."
    fi
    ;;
esac

if [ -n "$msg" ]; then
  jq -n --arg msg "memory-phase-router: $msg" '{agent_message: $msg}'
fi

exit 0
