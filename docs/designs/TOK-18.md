# TOK-18 — S1.1 Streamable HTTP transport

## Goal

Expose MCP Streamable HTTP at `POST`, `GET`, and `DELETE` `/mcp` with stateful `mcp-session-id` per F-01/F-02.

## Design

- **SDK:** `@modelcontextprotocol/sdk` — `McpServer`, `WebStandardStreamableHTTPServerTransport` (Web `Request`/`Response`, compatible with `c.req.raw`), `isInitializeRequest` from `types.js`.
- **Session map:** `Map<sessionId, WebStandardStreamableHTTPServerTransport>` — new transport + `McpServer` only on first `initialize` (no `mcp-session-id`); reuse transport for same id on later POST/GET/DELETE.
- **Resumability:** `InMemoryEventStore` (SDK examples helper) per session, matching the stateful pattern in `simpleStreamableHttp.js` so GET/SSE behavior is supported.
- **Invalid session:** Known id missing from map → **404** on POST; GET/DELETE without valid session → **400** (aligns with SDK examples for missing session on stream/terminate).
- **Hono:** Single `app.all("/mcp", …)` dispatches by `c.req.method`; `POST` passes `parsedBody` from `c.req.json()` into `handleRequest`.
- **CORS:** Scoped middleware on `/mcp` exposing `mcp-session-id`, `mcp-protocol-version`, `Last-Event-ID` for browser clients (mirrors SDK Hono sample).
- **Client headers:** MCP POST requires `Accept` listing both `application/json` and `text/event-stream`; GET requires `text/event-stream` (SDK validation).

## Non-goals (later stories)

OAuth on `/mcp`, tool registry content (S1.2), production-grade event store.
