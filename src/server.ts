import { Hono } from "hono";
import {
  createLogger,
  hashSessionId,
  newRequestId,
  outcomeFromStatus,
} from "./observability/logger.js";

/**
 * Build a Hono app for the gdrive-cowork-connector MCP server.
 *
 * Pure factory: no side effects, no port binding, no env reads. Tests use
 * `app.request(...)` (or `app.fetch(...)`) to exercise routes without spinning
 * up a real network listener; `src/index.ts` is the only place that binds to
 * `process.env.PORT` via `@hono/node-server`.
 */
export function createApp(): Hono {
  const app = new Hono();
  const logger = createLogger();

  app.use("*", async (c, next) => {
    const start = performance.now();
    const requestId = newRequestId();
    const sessionId = c.req.header("mcp-session-id") ?? null;

    try {
      await next();
    } finally {
      const latencyMs = Math.max(0, performance.now() - start);
      const status = c.res.status;

      logger.info({
        request_id: requestId,
        session_id_hash: sessionId ? hashSessionId(sessionId) : null,
        method: c.req.method,
        path: c.req.path,
        status,
        outcome: outcomeFromStatus(status),
        latency_ms: Math.round(latencyMs),
      });
    }
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json({
      issuer: "https://example.invalid",
      authorization_endpoint: "https://example.invalid/oauth/authorize",
      token_endpoint: "https://example.invalid/oauth/token",
      jwks_uri: "https://example.invalid/.well-known/jwks.json",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    }),
  );

  return app;
}
