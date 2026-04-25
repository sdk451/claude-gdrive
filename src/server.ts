import { Hono } from "hono";

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

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  return app;
}
