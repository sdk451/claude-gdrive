import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { cors } from "hono/cors";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createFetchDriveFilesPort } from "../drive/fetch-drive-files.js";
import type { DriveFilesPort } from "../drive/drive-files-port.js";
import { createGdriveMcpServer } from "./gdrive-mcp-server.js";

const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

/** Until F-10 wires per-session Google tokens, default port rejects list calls without a token. */
const defaultDriveFilesPort: DriveFilesPort = createFetchDriveFilesPort(() => undefined);

export type MountStreamableMcpOptions = {
  driveFiles?: DriveFilesPort;
};

/**
 * Stateful Streamable HTTP MCP at `/mcp` (POST / GET / DELETE).
 * Session id is issued on `initialize` and required thereafter (F-02).
 */
export function mountStreamableMcp(app: Hono, options?: MountStreamableMcpOptions): void {
  app.use(
    "/mcp",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"],
      exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
    }),
  );

  app.all("/mcp", async (c) => {
    const method = c.req.method;
    if (method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    const sessionHeader = c.req.header("mcp-session-id") ?? undefined;
    const raw = c.req.raw;

    if (method === "POST") {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        body = undefined;
      }

      if (sessionHeader) {
        if (!transports.has(sessionHeader)) {
          return c.json(
            {
              jsonrpc: "2.0",
              error: { code: -32001, message: "Session not found" },
              id: null,
            },
            404,
          );
        }
        const transport = transports.get(sessionHeader)!;
        return transport.handleRequest(raw, { parsedBody: body });
      }

      if (body !== undefined && isInitializeRequest(body)) {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore: new InMemoryEventStore(),
          /** JSON responses for POST (simpler for gateways/tests); GET remains SSE. */
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };
        const driveFiles = options?.driveFiles ?? defaultDriveFilesPort;
        const server = createGdriveMcpServer({ driveFiles });
        await server.connect(transport);
        return transport.handleRequest(raw, { parsedBody: body });
      }

      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message:
              "Bad Request: send initialize without mcp-session-id first, or include a valid mcp-session-id",
          },
          id: null,
        },
        400,
      );
    }

    if (method === "GET" || method === "DELETE") {
      if (!sessionHeader || !transports.has(sessionHeader)) {
        return c.text("Invalid or missing session ID", 400);
      }
      const transport = transports.get(sessionHeader)!;
      return transport.handleRequest(raw);
    }

    return c.text("Method Not Allowed", 405);
  });
}
