import { Buffer } from "node:buffer";

import type {
  DriveFileRef,
  DriveFilesPort,
  DownloadFileContentParams,
  DownloadFileContentResult,
  FileMetadataOwner,
  FileMetadataResult,
  GetFileMetadataParams,
  ListFilesParams,
  ListFilesResult,
  ReadFileContentParams,
  ReadFileContentResult,
} from "./drive-files-port.js";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

function isTextualMime(mime: string, exportMimeType: string | undefined): boolean {
  const m = mime.toLowerCase();
  if (m.startsWith("text/") || m === "application/json" || m.includes("xml")) {
    return true;
  }
  if (exportMimeType?.toLowerCase().startsWith("text/")) {
    return true;
  }
  return false;
}

const FILE_METADATA_FIELDS =
  "id,name,mimeType,size,modifiedTime,shared,owners(displayName,permissionId)";

function parseFileMetadata(data: Record<string, unknown>): FileMetadataResult {
  const id = String(data.id ?? "");
  const name = String(data.name ?? "");
  const result: FileMetadataResult = { id, name };
  if (typeof data.mimeType === "string") {
    result.mimeType = data.mimeType;
  }
  if (typeof data.size === "string") {
    result.size = data.size;
  }
  if (typeof data.modifiedTime === "string") {
    result.modifiedTime = data.modifiedTime;
  }
  if (typeof data.shared === "boolean") {
    result.shared = data.shared;
  }
  if (Array.isArray(data.owners)) {
    result.owners = data.owners.map((raw) => {
      const o = raw as Record<string, unknown>;
      const owner: FileMetadataOwner = {};
      if (typeof o.displayName === "string") {
        owner.displayName = o.displayName;
      }
      if (typeof o.permissionId === "string") {
        owner.permissionId = o.permissionId;
      }
      return owner;
    });
  }
  return result;
}

function driveErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } }).error;
    if (err && typeof err.message === "string") {
      return err.message;
    }
  }
  return `Drive API error (${status})`;
}

/**
 * Production-oriented `files.list` via `fetch`.
 * `getAccessToken` must return a valid Google OAuth access token (per-session wiring is F-10).
 */
export function createFetchDriveFilesPort(
  getAccessToken: () => string | undefined,
  deps: { fetchFn?: typeof fetch } = {},
): DriveFilesPort {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const url = new URL(DRIVE_FILES_ENDPOINT);
      url.searchParams.set("q", params.q);
      url.searchParams.set(
        "fields",
        "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
      );
      if (params.pageSize != null) {
        url.searchParams.set("pageSize", String(params.pageSize));
      }
      if (params.pageToken) {
        url.searchParams.set("pageToken", params.pageToken);
      }

      const res = await fetchFn(url.href, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }

      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }

      const o = data as Record<string, unknown>;
      const filesRaw = Array.isArray(o.files) ? o.files : [];
      const files: DriveFileRef[] = filesRaw.map((row) => {
        const f = row as Record<string, unknown>;
        const ref: DriveFileRef = {
          id: String(f.id ?? ""),
          name: String(f.name ?? ""),
        };
        if (typeof f.mimeType === "string") {
          ref.mimeType = f.mimeType;
        }
        if (typeof f.modifiedTime === "string") {
          ref.modifiedTime = f.modifiedTime;
        }
        if (typeof f.size === "string") {
          ref.size = f.size;
        }
        return ref;
      });

      const nextPageToken = typeof o.nextPageToken === "string" ? o.nextPageToken : undefined;
      return nextPageToken ? { files, nextPageToken } : { files };
    },

    async readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      let url: string;
      if (params.exportMimeType !== undefined) {
        const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}/export`);
        u.searchParams.set("mimeType", params.exportMimeType);
        url = u.href;
      } else {
        const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
        u.searchParams.set("alt", "media");
        url = u.href;
      }

      const res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        throw new Error(driveErrorMessage(data, res.status));
      }

      if (isTextualMime(contentType, params.exportMimeType)) {
        const text = await res.text();
        return { mimeType: contentType, encoding: "utf-8", data: text };
      }

      const buf = await res.arrayBuffer();
      return {
        mimeType: contentType,
        encoding: "base64",
        data: Buffer.from(buf).toString("base64"),
      };
    },

    async downloadFileContent(
      params: DownloadFileContentParams,
    ): Promise<DownloadFileContentResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
      u.searchParams.set("alt", "media");
      const res = await fetchFn(u.href, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        throw new Error(driveErrorMessage(data, res.status));
      }

      const buf = await res.arrayBuffer();
      return {
        mimeType: contentType,
        base64: Buffer.from(buf).toString("base64"),
      };
    },

    async getFileMetadata(params: GetFileMetadataParams): Promise<FileMetadataResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
      u.searchParams.set("fields", FILE_METADATA_FIELDS);
      const res = await fetchFn(u.href, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }
      return parseFileMetadata(data as Record<string, unknown>);
    },
  };
}
