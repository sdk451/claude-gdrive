# TOK-31 — Design: S3.2 `move_file`

## Goal

Expose MCP tool `move_file` that relocates a Drive item between parents using `files.update` with **`addParents`** and **`removeParents`** query parameters (no separate metadata body required).

## API mapping

| Layer            | Behavior                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| MCP `move_file`  | Required `fileId`, `addParentFolderId`, `removeParentFolderId` (explicit source/dest parents).    |
| `DriveFilesPort` | `moveFile(params)` → `MoveFileResult` (`id`, `name`, `mimeType?`).                                |
| Google Drive     | `PATCH /drive/v3/files/{fileId}?addParents=…&removeParents=…&fields=…` with empty JSON body `{}`. |

## Annotations

Per backlog: **`destructiveHint: true`** on the tool registration.

## Errors

- No OAuth token: same message family as other Drive tools.
- Drive 4xx/5xx: surface `error.message` from JSON when present.
