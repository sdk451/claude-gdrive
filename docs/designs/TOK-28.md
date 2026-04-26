# TOK-28 — S2.6 `create_file`

## Goal

Expose MCP tool `create_file` for Drive `files.create`: empty Google Docs/Sheets/Slides, folders (`application/vnd.google-apps.folder`), and optional **small binary** creates via `uploadType=multipart` (PRD §5.2, architecture).

## Approach

1. **Port** — `createFile(params)` with `name`, `mimeType`, optional `parentFolderId`, optional `mediaBase64` + `mediaMimeType` (required together). Returns `{ id, name, mimeType? }`.

2. **Fetch**
   - **Metadata-only** — `POST https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType` + JSON body `{ name, mimeType, parents? }`.
   - **With media** — `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType`, `Content-Type: multipart/related; boundary=…`, two parts (JSON metadata then raw bytes). Decoded media capped at **32 MiB** to bound memory.

3. **MCP** — `create_file` Zod schema; JSON text result; same token gate errors as other tools.

4. **Tests** — Contract `inputSchema`; integration stub + no-token; extend all `DriveFilesPort` stubs.

## Out of scope

- Resumable (`uploadType=resumable`) large uploads.
- `destructiveHint` / `readOnlyHint` (not yet used elsewhere on this registry).

## Verification

`docs/tests/TOK-28-targets.txt`; typecheck, lint, `lint:md`, targeted script, full test.
