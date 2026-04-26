# Runbook: `tools.list.empty` / `tools_list_empty_total`

## Trigger

- Log-based alert or dashboard shows **`msg: tools.list.empty`** / non-zero rate for **`metric: tools_list_empty_total`**.
- User reports Cowork / Claude shows **no tools** despite a successful OAuth connection.

## First checks

1. Confirm the MCP **`POST /mcp`** JSON-RPC response for `tools/list` is not HTTP 200 with `result.tools: []` (use MCP Inspector or `curl` with a valid `mcp-session-id`).
2. Compare **`GDRIVE_MCP_TOOL_NAMES`** in `src/mcp/gdrive-mcp-server.ts` with `server.registerTool` registrations — a drift means contract tests should fail in CI.
3. Inspect recent deploy: did a release ship **without** Drive tool registrations (e.g. accidental revert of `createGdriveMcpServer`)?

## Likely causes

- Regression in MCP server construction (empty registry while transport still answers `tools/list`).
- Middleware or proxy stripping JSON body so the server mis-handles session requests (rare).

## Mitigation

- Roll back to last known-good image digest (see `docs/environments.md`).
- Hotfix: restore full tool registration in `gdrive-mcp-server.ts` and redeploy.

## Rollback

Same as mitigation — digest-based promotion; no data migration.
