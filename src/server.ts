import { Hono } from "hono";
import {
  createLogger,
  hashSessionId,
  newRequestId,
  outcomeFromStatus,
} from "./observability/logger.js";
import { readinessSentryPing } from "./observability/sentry-readiness.js";
import { mountStreamableMcp } from "./mcp/streamable-http.js";
import {
  buildAuthorizationServerMetadata,
  DEFAULT_OAUTH_ISSUER_BASE_URL,
} from "./oauth/authorization-server-metadata.js";
import { mountOauthRoutes, type OauthRouteConfig } from "./oauth/mount-oauth-routes.js";

export type CreateAppOptions = {
  /** Issuer base URL for RFC 8414 metadata (from `PUBLIC_ISSUER_URL` at boot). */
  oauthIssuerBaseUrl?: string;
  /** When set, mounts DCR + OAuth authorize/callback/token (S1.4 / TOK-21). */
  oauth?: OauthRouteConfig;
};

/**
 * Build a Hono app for the gdrive-cowork-connector MCP server.
 *
 * Pure factory: no side effects, no port binding, no env reads. Tests use
 * `app.request(...)` (or `app.fetch(...)`) to exercise routes without spinning
 * up a real network listener; `src/index.ts` is the only place that binds to
 * `process.env.PORT` via `@hono/node-server`.
 */
export function createApp(options?: CreateAppOptions): Hono {
  const oauthIssuerBaseUrl = options?.oauthIssuerBaseUrl ?? DEFAULT_OAUTH_ISSUER_BASE_URL;
  const oauthMetadata = buildAuthorizationServerMetadata(oauthIssuerBaseUrl);

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

  mountStreamableMcp(app);

  app.get("/.well-known/oauth-authorization-server", (c) => c.json(oauthMetadata));

  if (options?.oauth) {
    mountOauthRoutes(app, options.oauth);
  }

  // Release / load-balancer smoke only — not a full MCP tools/list transport.
  app.get("/__smoke/mcp-tools-list", (c) =>
    c.json({
      jsonrpc: "2.0",
      id: "smoke",
      result: {
        tools: [{ name: "smoke.stub", description: "Probe for prod release workflow" }],
      },
    }),
  );

  /** Optional Sentry probe — only loads SDK when `SENTRY_DSN` is set. */
  app.get("/__smoke/sentry-test", async (c) => {
    const result = await readinessSentryPing();
    return c.json(result);
  });

  return app;
}
