# TOK-42 — Test plan: S5.3 Indirect prompt-injection mitigations

## Scope

Contract coverage for **`destructiveHint`** on all state-changing Drive tools and absence of `destructiveHint` on read-oriented tools.

## Cases

1. **`tools/list` destructive hints** — For `create_file`, `update_file`, `move_file`, `share_file`: `annotations.destructiveHint === true`. For every other name in `GDRIVE_MCP_TOOL_NAMES`: `annotations.destructiveHint` is not `true`.

## Targets

- `docs/tests/TOK-42-targets.txt` (CI)
- `docs/tests/S5.3-targets.txt` (backlog alias)
