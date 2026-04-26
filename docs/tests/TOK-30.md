# TOK-30 — Test plan (S3.1 `update_file`)

## Cases

1. **tools/list** — `update_file` present; `fileId` required in schema; optional `name`, `mimeType`, `mediaBase64`, `mediaMimeType`; `annotations.destructiveHint === true`.

2. **Stub metadata** — `tools/call` with `fileId` + `name` (or `mimeType`) forwards to `DriveFilesPort.updateFile`; JSON result echoed.

3. **Stub media** — With `mediaBase64` + `mediaMimeType`, stub receives both.

4. **Validation** — `mediaBase64` without `mediaMimeType` → `isError`. Nothing but `fileId` → `isError`.

5. **No token** — Default port → `isError` (not connected).

6. **Registry** — Epic 2 tools plus `create_file` and `update_file` in `tools/list`.
