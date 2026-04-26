# TOK-33 — Design: S3.4 `list_folder`

## Goal

Expose MCP tool `list_folder` to list **immediate children** of a folder with pagination, backed by Drive `files.list` with a fixed `q` pattern.

## Query shape

Drive `q`:

```txt
'<folderId>' in parents and trashed = false
```

Single quotes around the folder id per Drive search syntax; escape embedded `\` and `'` in `folderId` before interpolation.

## Port

- `listFolder(params: ListFolderParams): Promise<ListFilesResult>` — same row shape as `search_files` / `listFiles` (`id`, `name`, `mimeType`, …).

## Fetch

Implementation delegates to existing `listFiles` after building `q` (one network path, consistent field mask).

## MCP

- Inputs: `folderId` (required), optional `pageSize`, `pageToken`.
- **`readOnlyHint: true`** (read-only; no `destructiveHint`).
