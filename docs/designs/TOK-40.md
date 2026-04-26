# TOK-40 — Design: S5.1 `tools.list` regression suite

## Goal

Lock in the **“connected but `tools/list` is empty”** failure mode from the bundled Anthropic connector: defend with **named regression tests**, a **`tools_list_empty_total`** counter, structured **`tools.list.empty`** logs, and operator-facing **alert + runbook** pointers.

## Behaviour

1. **`tools.list.returns_full_set_after_oauth`** — Contract: with `createApp({ driveFiles })` where `getAccessToken()` returns a string (simulates a completed OAuth / connected session per F-10 wording), after `initialize` the next `tools/list` returns **every** name in `GDRIVE_MCP_TOOL_NAMES` (single source of truth in `gdrive-mcp-server.ts`).
2. **`tools.list.never_empty_post_init`** — Contract “chaos”: after a valid session, responses must **never** be HTTP 200 with `result.tools === []` (the silent failure). Legitimate outcomes include JSON-RPC **`error`** (e.g. unknown session **404**), or **`result.tools`** with length ≥ 1.
3. **`tools_list_empty_total`** — In-process counter incremented whenever we observe a **successful** JSON `tools/list` payload whose `result.tools` is an **empty array** (should not happen in production). Emitted together with a structured log line suitable for **Cloud Logging log-based metrics** (see `docs/observability.md`).

## Implementation

- **`src/observability/tools-list-empty.ts`** — Counter + `resetToolsListEmptyTotalForTests()` + `inspectToolsListJsonRpcResponse(sessionIdHash, parsedJson)` (increments + warn log when empty).
- **`src/mcp/streamable-http.ts`** — After `transport.handleRequest` on the **session-bound** POST path, parse JSON body (via `Response.clone()`); call inspector when `Content-Type` is JSON.
- **`src/mcp/gdrive-mcp-server.ts`** — Export `GDRIVE_MCP_TOOL_NAMES` (frozen list matching registered tools).
- **`docs/runbooks/tools-list-empty.md`** — Page trigger, first checks, mitigation (per constitution / observability).
- **`docs/observability.md`** — Document log filter / metric name for operators.

## Non-goals

- Changing OAuth session ↔ MCP wiring (F-10) beyond what tests need via injected `driveFiles`.
- Prometheus scrape endpoint or OTEL custom metrics in this story (counter + logs + runbook satisfy “instrumented and alarmed” for v1).

## Acceptance

- AC1–AC2 satisfied by Vitest contract file referenced from `docs/tests/TOK-40-targets.txt` and `docs/tests/S5.1-targets.txt`.
- AC3 satisfied by counter + log + observability doc + runbook.
