# TOK-23 — S2.1 `search_files`

## Goal

Expose MCP tool `search_files` that searches Google Drive using Drive query syntax (`q`), backed by Drive API `files.list` (PRD §5.2, architecture tool map).

## Approach

1. **Tool contract** — Register `search_files` on `McpServer` with Zod `inputSchema`: required `q` (string), optional `pageSize` (positive int, cap 100), optional `pageToken` (string). Description references Drive [search query](https://developers.google.com/drive/api/guides/search-files).

2. **Drive port** — `DriveFilesPort.listFiles({ q, pageSize?, pageToken? })` returns normalized `{ files: DriveFileRef[]; nextPageToken?: string }`. Keeps Google wire format out of the tool handler and enables tests without network.

3. **HTTP implementation** — `createFetchDriveFilesPort(getAccessToken: () => string | undefined)` uses `fetch` to `GET https://www.googleapis.com/drive/v3/files` with `Authorization: Bearer`, `q`, `pageSize`, `pageToken`, `fields=id,name,mimeType,modifiedTime,size`. Missing token → tool returns `isError` text (no tokens in logs).

4. **Wiring** — `createGdriveMcpServer({ driveFiles })`; `mountStreamableMcp(app, { driveFiles })`; `createApp({ driveFiles })` threads the same port per process (Epic 1: single stub in tests; prod `index.ts` can pass fetch port when session tokens exist).

5. **TOK-19 follow-up** — Remove the disabled `gdrive._registry_init` shim; `search_files` is the first real tool. `tools/list` lists `search_files` only (F-03).

## Out of scope

- OAuth token binding per MCP session (F-10) — port receives token via factory; stub in tests.
- Pagination UX beyond returning `nextPageToken` in JSON.
- Shared drives / corpora parameters.

## Verification

`docs/tests/TOK-23-targets.txt` + `docs/tests/S2.1-targets.txt`; `pnpm typecheck`, `pnpm lint`, full `pnpm test`.
