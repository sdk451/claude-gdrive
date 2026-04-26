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

/** Abstraction over Drive read/search for tests and production. */
export interface DriveFilesPort {
  listFiles(params: ListFilesParams): Promise<ListFilesResult>;
  readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult>;
  downloadFileContent(params: DownloadFileContentParams): Promise<DownloadFileContentResult>;
  getFileMetadata(params: GetFileMetadataParams): Promise<FileMetadataResult>;
  createFile(params: CreateFileParams): Promise<CreateFileResult>;
}
