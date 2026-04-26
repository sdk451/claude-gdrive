# TOK-24 — S2.2 `read_file_content`

## Goal

Expose MCP tool `read_file_content` for Docs/Sheets/Slides exports and native file bytes via Drive `files.export` / `files.get` (`alt=media`) (PRD §5.2, architecture).

## Approach

1. **Port** — Extend `DriveFilesPort` with `readFileContent({ fileId, exportMimeType? })` returning `{ mimeType, encoding: "utf-8" | "base64", data }`. Textual exports and `text/*` responses use UTF-8; binary `alt=media` uses base64 (no raw bytes in logs).

2. **Fetch** — If `exportMimeType` set: `GET .../files/{id}/export?mimeType=...`. Else: `GET .../files/{id}?alt=media`. Same token gate as `listFiles`.

3. **MCP** — Register `read_file_content` with Zod: required `fileId`, optional `exportMimeType` (describe Google export MIME types for Workspace files).

4. **Tests** — Contract: `tools/list` schema for `read_file_content`. Integration: stub port + default no-token `isError`. Update existing Drive stubs to implement the new method.

## Out of scope

- Per-session OAuth token binding (F-10).
- OCR or non-Drive formats.
- Partial/range reads.

## Verification

`docs/tests/TOK-24-targets.txt`; `pnpm typecheck`, `pnpm lint`, `pnpm test`.
