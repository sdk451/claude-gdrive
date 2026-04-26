# TOK-19 — S1.2 Tool registry plumbing (empty)

## Goal

Expose a single MCP server construction path where tools will register; with **zero** tools today, `tools/list` is an empty array and `tools/call` yields a structured tool error for unknown names (F-03/F-04).

## Design

- **`createGdriveMcpServer()`** in `src/mcp/gdrive-mcp-server.ts` — returns `McpServer` from `@modelcontextprotocol/sdk` with product `name`/`version`. Future Drive tools call `registerTool` here only (one registry surface per architecture).
- **Transport unchanged** — `mountStreamableMcp` in `streamable-http.ts` calls `createGdriveMcpServer()` per new session (same as today, but wired through the factory).
- **Behavior** — delegated to SDK defaults: empty registry → `tools/list` → `{ tools: [] }`; unknown `tools/call` → `CallToolResult` with `isError: true` and `content: [{ type: "text", text: ... }]` (text-first).

## Out of scope

Real Drive tools, OAuth, non-empty schemas beyond what the SDK requires.
