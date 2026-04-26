# TOK-19 — Test plan (S1.2)

## Contract (`tests/contract/mcp-tool-registry.test.ts`)

1. After MCP `initialize`, **`tools/list`** returns JSON-RPC `result.tools` as an **empty array** (structurally valid list).
2. **`tools/call`** for a bogus tool name returns **`result.isError === true`**, **`content[0].type === "text"`**, and a non-empty message string (unknown-tool path).

## Regression

`pnpm test` + targeted runner for CI.
