import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  CreateFileParams,
  DriveFilesPort,
  DownloadFileContentParams,
  GetFileMetadataParams,
  ListFilePermissionsParams,
  ListFilesParams,
  ListFolderParams,
  MoveFileParams,
  ReadFileContentParams,
  ShareFileGrantParams,
  UpdateFileParams,
} from "../drive/drive-files-port.js";

export type CreateGdriveMcpServerOptions = {
  driveFiles: DriveFilesPort;
};

/** Names returned by `tools/list` for this build — keep in sync with `registerTool` below. */
export const GDRIVE_MCP_TOOL_NAMES = [
  "search_files",
  "list_folder",
  "read_file_content",
  "download_file_content",
  "get_file_metadata",
  "get_file_permissions",
  "create_file",
  "update_file",
  "move_file",
  "share_file",
] as const;

/**
 * Builds the MCP server for one Streamable HTTP session (F-03/F-04).
 * Registers Drive tools (TOK-23 `search_files`, TOK-33 `list_folder`, TOK-24 `read_file_content`, TOK-25 `download_file_content`, TOK-26 `get_file_metadata`, TOK-27 `get_file_permissions`, TOK-28 `create_file`, TOK-30 `update_file`, TOK-31 `move_file`, TOK-32 `share_file`).
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
    "list_folder",
    {
      title: "List files in a Drive folder",
      description:
        "List files and folders whose parent is the given folder id (`files.list` with `'<folderId>' in parents`, excluding trashed). Supports pagination via `pageToken` from a prior response.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        folderId: z
          .string()
          .min(1)
          .describe(
            "Drive folder `fileId` whose children to list (the folder itself is not included).",
          ),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum items to return per page (Drive default applies if omitted)."),
        pageToken: z
          .string()
          .optional()
          .describe("Pagination token from a previous `list_folder` response."),
      },
    },
    async (args) => {
      try {
        const params: ListFolderParams = { folderId: args.folderId };
        if (args.pageSize !== undefined) {
          params.pageSize = args.pageSize;
        }
        if (args.pageToken !== undefined) {
          params.pageToken = args.pageToken;
        }
        const result = await driveFiles.listFolder(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive list folder failed";
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
      annotations: { destructiveHint: true },
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

  server.registerTool(
    "update_file",
    {
      title: "Update Drive file",
      description:
        "Update a Google Drive file via `files.update`: rename or change MIME with `name` / `mimeType`, or replace binary content using `mediaBase64` + `mediaMimeType` (multipart; same size limits as create). At least one of `name`, `mimeType`, or `mediaBase64` is required.",
      annotations: { destructiveHint: true },
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` of the file to update."),
        name: z
          .string()
          .min(1)
          .optional()
          .describe("New display name (metadata-only update, or combined with media upload)."),
        mimeType: z
          .string()
          .min(1)
          .optional()
          .describe("New MIME type when updating metadata or multipart metadata part."),
        mediaBase64: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional base64 file bytes to replace file content (multipart `files.update`).",
          ),
        mediaMimeType: z
          .string()
          .min(1)
          .optional()
          .describe("MIME type of decoded `mediaBase64` (required when `mediaBase64` is set)."),
      },
    },
    async (args) => {
      try {
        const hasMedia =
          args.mediaBase64 !== undefined &&
          args.mediaBase64 !== "" &&
          args.mediaBase64.trim() !== "";
        if (hasMedia && (args.mediaMimeType === undefined || args.mediaMimeType === "")) {
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
        if (
          !hasMedia &&
          (args.name === undefined || args.name === "") &&
          (args.mimeType === undefined || args.mimeType === "")
        ) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: "Provide at least one of name, mimeType, or mediaBase64 to update a file",
              },
            ],
          };
        }
        const params: UpdateFileParams = { fileId: args.fileId };
        if (args.name !== undefined) {
          params.name = args.name;
        }
        if (args.mimeType !== undefined) {
          params.mimeType = args.mimeType;
        }
        if (args.mediaBase64 !== undefined) {
          params.mediaBase64 = args.mediaBase64;
        }
        if (args.mediaMimeType !== undefined) {
          params.mediaMimeType = args.mediaMimeType;
        }
        const result = await driveFiles.updateFile(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive update failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "move_file",
    {
      title: "Move Drive file between folders",
      description:
        "Move a file or folder to another parent using Drive `files.update` query parameters `addParents` and `removeParents`. Supply the current parent folder id to remove and the destination folder id to add (use `root` for My Drive root when applicable).",
      annotations: { destructiveHint: true },
      inputSchema: {
        fileId: z.string().min(1).describe("The Drive `fileId` of the file or folder to move."),
        addParentFolderId: z
          .string()
          .min(1)
          .describe("Destination parent folder `fileId` (Drive `addParents`)."),
        removeParentFolderId: z
          .string()
          .min(1)
          .describe(
            "Parent folder `fileId` to remove from (Drive `removeParents`; often the folder the item is leaving).",
          ),
      },
    },
    async (args) => {
      try {
        const params: MoveFileParams = {
          fileId: args.fileId,
          addParentFolderId: args.addParentFolderId,
          removeParentFolderId: args.removeParentFolderId,
        };
        const result = await driveFiles.moveFile(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive move failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.registerTool(
    "share_file",
    {
      title: "Grant or revoke Drive file permissions",
      description:
        'Add or remove sharing: `action: "grant"` uses `permissions.create` (set `granteeType` `user` | `group` | `domain` | `anyone`, `role`, and `emailAddress` or `domain` as required); `action: "revoke"` uses `permissions.delete` with `permissionId`.',
      annotations: { destructiveHint: true },
      inputSchema: {
        action: z
          .enum(["grant", "revoke"])
          .describe('Use "grant" to add an ACL entry, "revoke" to remove one by permission id.'),
        fileId: z.string().min(1).describe("Target file or folder `fileId`."),
        role: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Drive role when granting (e.g. `reader`, `writer`). Required when action is grant.",
          ),
        granteeType: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Drive permission type when granting: `user`, `group`, `domain`, or `anyone`. Required when action is grant.",
          ),
        emailAddress: z
          .string()
          .min(1)
          .optional()
          .describe("Email for `user` or `group` grantee (required for those types)."),
        domain: z
          .string()
          .min(1)
          .optional()
          .describe("Domain when `granteeType` is `domain` (required for domain)."),
        permissionId: z
          .string()
          .min(1)
          .optional()
          .describe("Permission id to delete when action is revoke (from `get_file_permissions`)."),
      },
    },
    async (args) => {
      try {
        if (args.action === "revoke") {
          if (args.permissionId === undefined || args.permissionId === "") {
            return {
              isError: true as const,
              content: [
                {
                  type: "text" as const,
                  text: "permissionId is required when action is revoke",
                },
              ],
            };
          }
          const result = await driveFiles.shareFile({
            action: "revoke",
            fileId: args.fileId,
            permissionId: args.permissionId,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (
          args.role === undefined ||
          args.role === "" ||
          args.granteeType === undefined ||
          args.granteeType === ""
        ) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: "role and granteeType are required when action is grant",
              },
            ],
          };
        }

        const gt = args.granteeType.trim().toLowerCase();
        if (
          (gt === "user" || gt === "group") &&
          (args.emailAddress === undefined || args.emailAddress === "")
        ) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: "emailAddress is required when granteeType is user or group",
              },
            ],
          };
        }
        if (gt === "domain" && (args.domain === undefined || args.domain === "")) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: "domain is required when granteeType is domain",
              },
            ],
          };
        }

        const params: ShareFileGrantParams = {
          action: "grant",
          fileId: args.fileId,
          role: args.role,
          granteeType: args.granteeType,
        };
        if (args.emailAddress !== undefined) {
          params.emailAddress = args.emailAddress;
        }
        if (args.domain !== undefined) {
          params.domain = args.domain;
        }
        const result = await driveFiles.shareFile(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Drive share failed";
        return {
          isError: true as const,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
