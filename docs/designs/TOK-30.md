# TOK-30 — Design: S3.1 `update_file`

## Goal

Expose MCP tool `update_file` backed by Drive `files.update`: metadata-only `PATCH` on the v3 files endpoint, or `uploadType=multipart` on the upload endpoint when replacing binary content (same size bound as `create_file`).

## API mapping

| Layer             | Behavior                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP `update_file` | `fileId` required; optional `name`, `mimeType`, `mediaBase64` + `mediaMimeType`. Reject calls with no updatable fields.                    |
| `DriveFilesPort`  | `updateFile(params)` → `UpdateFileResult` (`id`, `name`, `mimeType?`).                                                                     |
| Google Drive      | Metadata: `PATCH /drive/v3/files/{id}` JSON. Media: `PATCH /upload/drive/v3/files/{id}?uploadType=multipart` (metadata part + media part). |

## Annotations

Per backlog / UX: this tool can ship large bodies and overwrites content — register with `annotations: { destructiveHint: true }` (static on the tool; matches “large `update_file`” guidance).

## Limits

Decoded `mediaBase64` max **32 MiB**, same constant pattern as `create_file`.

## Errors

- No OAuth token: same message family as other Drive tools.
- `mediaBase64` set without `mediaMimeType`: explicit `isError` from MCP handler.
- No metadata and no media: reject before calling Drive.
