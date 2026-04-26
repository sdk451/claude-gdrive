# TOK-18 — Test plan (S1.1)

## Contract (`tests/contract/mcp-streamable-http.test.ts`)

1. **POST initialize** — no `mcp-session-id`, valid `initialize` JSON-RPC → 200, response exposes session id header, JSON-RPC result.
2. **POST with session** — JSON-RPC `ping` after init (with `mcp-protocol-version`) → 200 and `{}` result.
3. **POST unknown session** — random `mcp-session-id` → 404.
4. **GET** — same session → 200 (SSE or acceptable stream; assert not 4xx).
5. **DELETE** — terminates session; follow-up GET with same id → 400.

## Regression

Full `pnpm test` + targeted runner for CI.
