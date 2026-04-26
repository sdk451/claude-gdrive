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

/** Abstraction over Drive `files.list` for tests and production. */
export interface DriveFilesPort {
  listFiles(params: ListFilesParams): Promise<ListFilesResult>;
}
