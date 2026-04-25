import { serve } from "@hono/node-server";

import { parseBootEnv } from "./config/env.js";
import { createApp } from "./server.js";

const boot = parseBootEnv();
if (!boot.ok) {
  process.stderr.write(`${boot.message}\n`);
  process.exit(1);
}
const _validatedBootEnv = boot.value;

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  // Logging story (S0.6) replaces this stderr line with a structured pino logger.
  process.stderr.write(`gdrive-cowork-connector listening on :${info.port}\n`);
});
