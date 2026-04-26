import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  DriveFilesPort,
  DownloadFileContentParams,
  ListFilesParams,
  ReadFileContentParams,
} from "../drive/drive-files-port.js";

export type CreateGdriveMcpServerOptions = {
  driveFiles: DriveFilesPort;
};

/**
 * Builds the MCP server for one Streamable HTTP session (F-03/F-04).
 * Registers Drive tools (TOK-23 `search_files`, TOK-24 `read_file_content`, TOK-25 `download_file_content`).
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

  server.registerTool(
    "read_file_content",
    {
      title: "Read Drive file content",
      description:
        "Read file bytes or export Google Docs/Sheets/Slides. Use `exportMimeType` (e.g. `text/plain`, `text/csv`, `application/pdf`) for Workspace files (`files.export`); omit for native files (`files.get` with `alt=media`).",
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` from metadata or search results."),
        exportMimeType: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Export MIME type for Google Docs, Sheets, or Slides. See Drive `files.export`.",
          ),
      },
    },
    async (args) => {
      try {
        const params: ReadFileContentParams = { fileId: args.fileId };
        if (args.exportMimeType !== undefined) {
          params.exportMimeType = args.exportMimeType;
        }
        const result = await driveFiles.readFileContent(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive read failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "download_file_content",
    {
      title: "Download Drive file (binary)",
      description:
        "Download stored file bytes via `files.get` with `alt=media`. Returns JSON with `mimeType` and `base64` (always base64, safe for PDFs/images/Office). For Google Docs/Sheets/Slides text export, prefer `read_file_content` with `exportMimeType`.",
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` from metadata or search results."),
      },
    },
    async (args) => {
      try {
        const params: DownloadFileContentParams = { fileId: args.fileId };
        const result = await driveFiles.downloadFileContent(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive download failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
