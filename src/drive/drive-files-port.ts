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

/** Abstraction over Drive read/search for tests and production. */
export interface DriveFilesPort {
  listFiles(params: ListFilesParams): Promise<ListFilesResult>;
  readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult>;
}
