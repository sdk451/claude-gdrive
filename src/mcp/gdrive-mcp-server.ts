import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  CreateFileParams,
  DriveFilesPort,
  DownloadFileContentParams,
  GetFileMetadataParams,
  ListFilePermissionsParams,
  ListFilesParams,
  ReadFileContentParams,
} from "../drive/drive-files-port.js";

export type CreateGdriveMcpServerOptions = {
  driveFiles: DriveFilesPort;
};

/**
 * Builds the MCP server for one Streamable HTTP session (F-03/F-04).
 * Registers Drive tools (TOK-23 `search_files`, TOK-24 `read_file_content`, TOK-25 `download_file_content`, TOK-26 `get_file_metadata`, TOK-27 `get_file_permissions`, TOK-28 `create_file`).
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

  server.registerTool(
    "get_file_metadata",
    {
      title: "Get Drive file metadata",
      description:
        "Return file name, MIME type, size, modified time, shared flag, and owner display names via Drive `files.get` with explicit `fields`.",
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` from search results or URLs."),
      },
    },
    async (args) => {
      try {
        const params: GetFileMetadataParams = { fileId: args.fileId };
        const result = await driveFiles.getFileMetadata(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive metadata failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "get_file_permissions",
    {
      title: "List Drive file permissions",
      description:
        "List sharing ACL entries for a file via Drive `permissions.list` (id, type, role, display name, domain). Pagination optional.",
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` from search results or URLs."),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum permission rows per page (Drive default if omitted)."),
        pageToken: z
          .string()
          .optional()
          .describe("Pagination token from a previous `get_file_permissions` response."),
      },
    },
    async (args) => {
      try {
        const params: ListFilePermissionsParams = { fileId: args.fileId };
        if (args.pageSize !== undefined) {
          params.pageSize = args.pageSize;
        }
        if (args.pageToken !== undefined) {
          params.pageToken = args.pageToken;
        }
        const result = await driveFiles.listFilePermissions(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive permissions failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "create_file",
    {
      title: "Create Drive file or folder",
      description:
        "Create a Google Drive file via `files.create`: folders (`application/vnd.google-apps.folder`), empty Docs/Sheets/Slides (`application/vnd.google-apps.document` / `spreadsheet` / `presentation`), or a small binary file using `mediaBase64` + `mediaMimeType` (multipart upload; size limits apply).",
      inputSchema: {
        name: z.string().min(1).describe("Display name for the new file or folder."),
        mimeType: z
          .string()
          .min(1)
          .describe(
            "Drive MIME type for the new resource (e.g. `application/vnd.google-apps.folder`, `application/vnd.google-apps.document`).",
          ),
        parentFolderId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional parent folder `fileId`; omit for My Drive root behavior per account defaults.",
          ),
        mediaBase64: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional base64 file bytes for a non-Workspace binary create (uses multipart).",
          ),
        mediaMimeType: z
          .string()
          .min(1)
          .optional()
          .describe(
            "MIME type of the decoded `mediaBase64` payload (required when `mediaBase64` is set).",
          ),
      },
    },
    async (args) => {
      try {
        if (
          args.mediaBase64 !== undefined &&
          args.mediaBase64 !== "" &&
          (args.mediaMimeType === undefined || args.mediaMimeType === "")
        ) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: "mediaMimeType is required when mediaBase64 is set",
              },
            ],
          };
        }
        const params: CreateFileParams = {
          name: args.name,
          mimeType: args.mimeType,
        };
        if (args.parentFolderId !== undefined) {
          params.parentFolderId = args.parentFolderId;
        }
        if (args.mediaBase64 !== undefined) {
          params.mediaBase64 = args.mediaBase64;
        }
        if (args.mediaMimeType !== undefined) {
          params.mediaMimeType = args.mediaMimeType;
        }
        const result = await driveFiles.createFile(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive create failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
