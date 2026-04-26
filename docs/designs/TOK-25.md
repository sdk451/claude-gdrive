# TOK-25 — S2.3 `download_file_content`

## Goal

Expose MCP tool `download_file_content` for binary/native files (PDF, images, Office) via Drive `files.get` with `alt=media` (PRD §5.2, architecture).

## Approach

1. **Port** — Add `downloadFileContent({ fileId })` → `{ mimeType, base64 }`. Always base64-encodes the response body so MCP clients never receive corrupted binary from UTF-8 decoding (unlike `read_file_content` without export, which may return UTF-8 for `text/*`).

2. **Fetch** — Single `GET .../files/{id}?alt=media`; same token gate and error parsing as existing Drive calls.

3. **MCP** — Register `download_file_content` with Zod `fileId` only; JSON result in tool text.

4. **Tests** — Contract schema + integration stub + no-token path; extend all `DriveFilesPort` stubs.

## Out of scope

- Chunked / resumable large downloads.
- F-10 token wiring.

## Verification

`docs/tests/TOK-25-targets.txt`; typecheck, lint, targeted script, full test.
