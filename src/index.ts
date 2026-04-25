import { serve } from "@hono/node-server";

import { createApp } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  // Logging story (S0.6) replaces this stderr line with a structured pino logger.
  process.stderr.write(`gdrive-cowork-connector listening on :${info.port}\n`);
});
