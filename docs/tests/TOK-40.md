# TOK-40 — Test plan: S5.1 `tools.list` regression suite

## Scope

Regression coverage for MCP **`tools/list`** empty-catalog failure mode (S5.1).

## Cases

1. **`tools.list.returns_full_set_after_oauth`** — `createApp({ driveFiles: createFetchDriveFilesPort(() => "test-token") })`, `initialize` then `tools/list`; assert every tool in `GDRIVE_MCP_TOOL_NAMES` is present (order-independent).
2. **`tools.list.never_empty_post_init`** — Valid session: `tools/list` must not return `{ result: { tools: [] } }`. After `DELETE /mcp`, repeat `tools/list` with stale `mcp-session-id`: expect JSON-RPC **`error`** or non-empty `tools` if `result` exists — never HTTP 200 with empty `tools` array.
3. **`tools_list_empty_total`** (unit) — `inspectToolsListJsonRpcResponse` on a synthetic `{ result: { tools: [] } }` increments the counter; `resetToolsListEmptyTotalForTests` clears state between tests.

## Targets file

- Story CI: `docs/tests/TOK-40-targets.txt`
- Backlog alias: `docs/tests/S5.1-targets.txt` (same lines)
