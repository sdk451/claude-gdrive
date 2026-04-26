import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Builds the process-wide MCP server instance for one Streamable HTTP session.
 *
 * S1.2: **client-visible** tool catalog is empty (`tools/list` → `[]`). The MCP
 * TypeScript SDK only wires `tools/list` + `tools/call` after the first
 * `registerTool`, so we register an internal plumbing tool and immediately
 * `disable()` it — it is omitted from listings but keeps handlers active (F-03/F-04).
 * Epic 2+ registers real Drive tools here (same pattern).
 */
export function createGdriveMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "gdrive-cowork-connector",
      version: "0.0.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  const plumbing = server.registerTool(
    "gdrive._registry_init",
    {
      description: "Internal: activates MCP tool routing; disabled and not listed.",
    },
    async () => ({
      content: [{ type: "text" as const, text: "" }],
    }),
  );
  plumbing.disable();

  return server;
}
