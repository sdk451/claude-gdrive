import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

import type {
  CreateFileParams,
  CreateFileResult,
  DriveFileRef,
  DriveFilesPort,
  DownloadFileContentParams,
  DownloadFileContentResult,
  FileMetadataOwner,
  FileMetadataResult,
  FilePermissionRef,
  GetFileMetadataParams,
  ListFilePermissionsParams,
  ListFilePermissionsResult,
  ListFilesParams,
  ListFilesResult,
  MoveFileParams,
  MoveFileResult,
  ReadFileContentParams,
  ReadFileContentResult,
  ShareFileGrantResult,
  ShareFileParams,
  ShareFileResult,
  UpdateFileParams,
  UpdateFileResult,
} from "./drive-files-port.js";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_FILES_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";

/** Max decoded bytes for multipart `mediaBase64` (memory bound). */
const CREATE_FILE_MEDIA_MAX_BYTES = 32 * 1024 * 1024;

const CREATE_FILE_FIELDS = "id,name,mimeType";

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

const FILE_PERMISSIONS_LIST_FIELDS = "nextPageToken,permissions(id,type,role,domain,displayName)";

const PERMISSION_CREATE_FIELDS = "id,type,role,domain,displayName";

function parsePermissionRow(row: Record<string, unknown>): FilePermissionRef {
  const ref: FilePermissionRef = {
    id: String(row.id ?? ""),
    type: String(row.type ?? ""),
    role: String(row.role ?? ""),
  };
  if (typeof row.displayName === "string") {
    ref.displayName = row.displayName;
  }
  if (typeof row.domain === "string") {
    ref.domain = row.domain;
  }
  return ref;
}

function parseListFilePermissions(data: Record<string, unknown>): ListFilePermissionsResult {
  const permsRaw = Array.isArray(data.permissions) ? data.permissions : [];
  const permissions = permsRaw.map((raw) => parsePermissionRow(raw as Record<string, unknown>));
  const nextPageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
  return nextPageToken ? { permissions, nextPageToken } : { permissions };
}

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

function parseCreatedFile(data: Record<string, unknown>): CreateFileResult {
  const id = String(data.id ?? "");
  const name = String(data.name ?? "");
  const result: CreateFileResult = { id, name };
  if (typeof data.mimeType === "string") {
    result.mimeType = data.mimeType;
  }
  return result;
}

function buildMultipartCreateBody(
  metadata: Record<string, unknown>,
  mediaBuffer: Buffer,
  mediaMimeType: string,
  boundary: string,
): Buffer {
  const crlf = "\r\n";
  const metaJson = JSON.stringify(metadata);
  const head = `--${boundary}${crlf}Content-Type: application/json; charset=UTF-8${crlf}${crlf}${metaJson}${crlf}--${boundary}${crlf}Content-Type: ${mediaMimeType}${crlf}${crlf}`;
  const tail = `${crlf}--${boundary}--${crlf}`;
  return Buffer.concat([Buffer.from(head, "utf8"), mediaBuffer, Buffer.from(tail, "utf8")]);
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

    async listFilePermissions(
      params: ListFilePermissionsParams,
    ): Promise<ListFilePermissionsResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}/permissions`);
      u.searchParams.set("fields", FILE_PERMISSIONS_LIST_FIELDS);
      if (params.pageSize != null) {
        u.searchParams.set("pageSize", String(params.pageSize));
      }
      if (params.pageToken) {
        u.searchParams.set("pageToken", params.pageToken);
      }

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
      return parseListFilePermissions(data as Record<string, unknown>);
    },

    async createFile(params: CreateFileParams): Promise<CreateFileResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const hasMedia =
        params.mediaBase64 !== undefined &&
        params.mediaBase64 !== "" &&
        params.mediaBase64.trim() !== "";
      if (hasMedia && (params.mediaMimeType === undefined || params.mediaMimeType.trim() === "")) {
        throw new Error("mediaMimeType is required when mediaBase64 is set");
      }

      const metadata: Record<string, unknown> = {
        name: params.name,
        mimeType: params.mimeType,
      };
      if (params.parentFolderId !== undefined && params.parentFolderId !== "") {
        metadata.parents = [params.parentFolderId];
      }

      if (!hasMedia) {
        const u = new URL(DRIVE_FILES_ENDPOINT);
        u.searchParams.set("fields", CREATE_FILE_FIELDS);
        const res = await fetchFn(u.href, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify(metadata),
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(driveErrorMessage(data, res.status));
        }
        if (!data || typeof data !== "object") {
          throw new Error("Invalid Drive API response");
        }
        return parseCreatedFile(data as Record<string, unknown>);
      }

      const mediaBuf = Buffer.from(params.mediaBase64!, "base64");
      if (mediaBuf.length > CREATE_FILE_MEDIA_MAX_BYTES) {
        throw new Error(
          `Decoded media exceeds limit of ${CREATE_FILE_MEDIA_MAX_BYTES} bytes for create_file`,
        );
      }

      const boundary = `gdrive_${randomBytes(16).toString("hex")}`;
      const body = buildMultipartCreateBody(metadata, mediaBuf, params.mediaMimeType!, boundary);
      const u = new URL(DRIVE_UPLOAD_FILES_ENDPOINT);
      u.searchParams.set("uploadType", "multipart");
      u.searchParams.set("fields", CREATE_FILE_FIELDS);

      const res = await fetchFn(u.href, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }
      return parseCreatedFile(data as Record<string, unknown>);
    },

    async updateFile(params: UpdateFileParams): Promise<UpdateFileResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const hasMedia =
        params.mediaBase64 !== undefined &&
        params.mediaBase64 !== "" &&
        params.mediaBase64.trim() !== "";
      if (hasMedia && (params.mediaMimeType === undefined || params.mediaMimeType.trim() === "")) {
        throw new Error("mediaMimeType is required when mediaBase64 is set");
      }

      if (!hasMedia) {
        const patch: Record<string, unknown> = {};
        if (params.name !== undefined) {
          patch.name = params.name;
        }
        if (params.mimeType !== undefined) {
          patch.mimeType = params.mimeType;
        }
        if (Object.keys(patch).length === 0) {
          throw new Error(
            "Provide at least one of name, mimeType, or mediaBase64 to update a file",
          );
        }

        const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
        u.searchParams.set("fields", CREATE_FILE_FIELDS);
        const res = await fetchFn(u.href, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify(patch),
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(driveErrorMessage(data, res.status));
        }
        if (!data || typeof data !== "object") {
          throw new Error("Invalid Drive API response");
        }
        return parseCreatedFile(data as Record<string, unknown>);
      }

      const mediaBuf = Buffer.from(params.mediaBase64!, "base64");
      if (mediaBuf.length > CREATE_FILE_MEDIA_MAX_BYTES) {
        throw new Error(
          `Decoded media exceeds limit of ${CREATE_FILE_MEDIA_MAX_BYTES} bytes for update_file`,
        );
      }

      const metadata: Record<string, unknown> = {};
      if (params.name !== undefined) {
        metadata.name = params.name;
      }
      if (params.mimeType !== undefined) {
        metadata.mimeType = params.mimeType;
      }

      const boundary = `gdrive_${randomBytes(16).toString("hex")}`;
      const body = buildMultipartCreateBody(metadata, mediaBuf, params.mediaMimeType!, boundary);
      const u = new URL(`${DRIVE_UPLOAD_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
      u.searchParams.set("uploadType", "multipart");
      u.searchParams.set("fields", CREATE_FILE_FIELDS);

      const res = await fetchFn(u.href, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }
      return parseCreatedFile(data as Record<string, unknown>);
    },

    async moveFile(params: MoveFileParams): Promise<MoveFileResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}`);
      u.searchParams.set("addParents", params.addParentFolderId);
      u.searchParams.set("removeParents", params.removeParentFolderId);
      u.searchParams.set("fields", CREATE_FILE_FIELDS);

      const res = await fetchFn(u.href, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: "{}",
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }
      return parseCreatedFile(data as Record<string, unknown>);
    },

    async shareFile(params: ShareFileParams): Promise<ShareFileResult> {
      const token = getAccessToken();
      if (!token) {
        throw new Error(
          "Google Drive is not connected for this MCP session. Complete OAuth and retry.",
        );
      }

      if (params.action === "revoke") {
        const u = new URL(
          `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}/permissions/${encodeURIComponent(params.permissionId)}`,
        );
        const res = await fetchFn(u.href, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null);
          throw new Error(driveErrorMessage(data, res.status));
        }
        return { action: "revoke", deleted: true };
      }

      const role = params.role.trim();
      if (role === "") {
        throw new Error("role is required for grant");
      }
      const gt = params.granteeType.trim().toLowerCase();
      if (gt === "user" || gt === "group") {
        if (params.emailAddress === undefined || params.emailAddress.trim() === "") {
          throw new Error("emailAddress is required when granteeType is user or group");
        }
      } else if (gt === "domain") {
        if (params.domain === undefined || params.domain.trim() === "") {
          throw new Error("domain is required when granteeType is domain");
        }
      }

      const body: Record<string, unknown> = { type: gt, role };
      if (params.emailAddress !== undefined && params.emailAddress.trim() !== "") {
        body.emailAddress = params.emailAddress.trim();
      }
      if (params.domain !== undefined && params.domain.trim() !== "") {
        body.domain = params.domain.trim();
      }

      const u = new URL(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(params.fileId)}/permissions`);
      u.searchParams.set("fields", PERMISSION_CREATE_FIELDS);

      const res = await fetchFn(u.href, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(driveErrorMessage(data, res.status));
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid Drive API response");
      }
      const row = parsePermissionRow(data as Record<string, unknown>);
      const out: ShareFileGrantResult = {
        action: "grant",
        permissionId: row.id,
        type: row.type,
        role: row.role,
      };
      if (row.displayName !== undefined) {
        out.displayName = row.displayName;
      }
      if (row.domain !== undefined) {
        out.domain = row.domain;
      }
      return out;
    },
  };
}
