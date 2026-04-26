/** One row from Drive `files` resource (subset of fields). */
export type DriveFileRef = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
};

export type ListFilesParams = {
  /** Drive `files.list` `q` query (metadata / full-text). */
  q: string;
  pageSize?: number;
  pageToken?: string;
};

export type ListFilesResult = {
  files: DriveFileRef[];
  nextPageToken?: string;
};

/** `files.export` (Workspace) when `exportMimeType` is set; else `files.get` with `alt=media`. */
export type ReadFileContentParams = {
  fileId: string;
  /** e.g. `text/plain` for Docs, `text/csv` for Sheets — Drive `files.export` mimeType. */
  exportMimeType?: string;
};

export type ReadFileContentResult = {
  mimeType: string;
  encoding: "utf-8" | "base64";
  data: string;
};

/** `files.get` with `alt=media` — binary-safe base64 payload. */
export type DownloadFileContentParams = {
  fileId: string;
};

export type DownloadFileContentResult = {
  mimeType: string;
  base64: string;
};

export type GetFileMetadataParams = {
  fileId: string;
};

export type FileMetadataOwner = {
  displayName?: string;
  permissionId?: string;
};

export type FileMetadataResult = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  shared?: boolean;
  owners?: FileMetadataOwner[];
};

export type ListFilePermissionsParams = {
  fileId: string;
  pageSize?: number;
  pageToken?: string;
};

/** Subset of Drive `Permission` (no `emailAddress` in mapped output). */
export type FilePermissionRef = {
  id: string;
  type: string;
  role: string;
  displayName?: string;
  domain?: string;
};

export type ListFilePermissionsResult = {
  permissions: FilePermissionRef[];
  nextPageToken?: string;
};

export type CreateFileParams = {
  name: string;
  /** Target file MIME (e.g. `application/vnd.google-apps.folder`, `application/vnd.google-apps.document`). */
  mimeType: string;
  parentFolderId?: string;
  /** When set with `mediaMimeType`, uses `uploadType=multipart` (small payloads only; see server limit). */
  mediaBase64?: string;
  /** Required when `mediaBase64` is set. */
  mediaMimeType?: string;
};

export type CreateFileResult = {
  id: string;
  name: string;
  mimeType?: string;
};

export type UpdateFileParams = {
  fileId: string;
  name?: string;
  mimeType?: string;
  /** When set with `mediaMimeType`, uses multipart `files.update` (size limits apply). */
  mediaBase64?: string;
  /** Required when `mediaBase64` is set. */
  mediaMimeType?: string;
};

export type UpdateFileResult = CreateFileResult;

/** `files.update` with `addParents` / `removeParents` query parameters. */
export type MoveFileParams = {
  fileId: string;
  /** Drive `addParents` — folder `fileId` to attach (comma-separated in API; single id here). */
  addParentFolderId: string;
  /** Drive `removeParents` — folder `fileId` to detach (use `root` for My Drive root when applicable). */
  removeParentFolderId: string;
};

export type MoveFileResult = CreateFileResult;

export type ShareFileGrantParams = {
  action: "grant";
  fileId: string;
  /** Drive permission role (e.g. `reader`, `writer`, `commenter`). */
  role: string;
  /** Drive permission `type`: `user`, `group`, `domain`, or `anyone`. */
  granteeType: string;
  /** Required when `granteeType` is `user` or `group`. */
  emailAddress?: string;
  /** Required when `granteeType` is `domain`. */
  domain?: string;
};

export type ShareFileRevokeParams = {
  action: "revoke";
  fileId: string;
  permissionId: string;
};

export type ShareFileParams = ShareFileGrantParams | ShareFileRevokeParams;

export type ShareFileGrantResult = {
  action: "grant";
  permissionId: string;
  type: string;
  role: string;
  displayName?: string;
  domain?: string;
};

export type ShareFileRevokeResult = {
  action: "revoke";
  deleted: true;
};

export type ShareFileResult = ShareFileGrantResult | ShareFileRevokeResult;

/** Abstraction over Drive read/search for tests and production. */
export interface DriveFilesPort {
  listFiles(params: ListFilesParams): Promise<ListFilesResult>;
  readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult>;
  downloadFileContent(params: DownloadFileContentParams): Promise<DownloadFileContentResult>;
  getFileMetadata(params: GetFileMetadataParams): Promise<FileMetadataResult>;
  listFilePermissions(params: ListFilePermissionsParams): Promise<ListFilePermissionsResult>;
  createFile(params: CreateFileParams): Promise<CreateFileResult>;
  updateFile(params: UpdateFileParams): Promise<UpdateFileResult>;
  moveFile(params: MoveFileParams): Promise<MoveFileResult>;
  shareFile(params: ShareFileParams): Promise<ShareFileResult>;
}
