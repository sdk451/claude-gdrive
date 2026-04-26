import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DriveFilesPort, ListFilesParams } from "../drive/drive-files-port.js";

export type CreateGdriveMcpServerOptions = {
  driveFiles: DriveFilesPort;
};

/**
 * Builds the MCP server for one Streamable HTTP session (F-03/F-04).
 * Registers Drive tools; Epic 2 starts with `search_files` (TOK-23).
 */
export function createGdriveMcpServer(options: CreateGdriveMcpServerOptions): McpServer {
  const { driveFiles } = options;

  const server = new McpServer(
    {
      name: "gdrive-cowork-connector",
      version: "0.0.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.registerTool(
    "search_files",
    {
      title: "Search Drive files",
      description:
        "Search Google Drive using Drive query syntax (`q` parameter to files.list). Example: `name contains 'report'` or `mimeType = 'application/vnd.google-apps.document'`.",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .describe(
            "Drive search query. See https://developers.google.com/drive/api/guides/search-files",
          ),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum files to return per page (Drive default applies if omitted)."),
        pageToken: z
          .string()
          .optional()
          .describe("Pagination token from a previous `search_files` response."),
      },
    },
    async (args) => {
      try {
        const params: ListFilesParams = { q: args.q };
        if (args.pageSize !== undefined) {
          params.pageSize = args.pageSize;
        }
        if (args.pageToken !== undefined) {
          params.pageToken = args.pageToken;
        }
        const result = await driveFiles.listFiles(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive search failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
