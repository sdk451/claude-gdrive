# TOK-28 — Test plan (S2.6 create_file)

## Cases

1. **tools/list** — `create_file` with required `name` and `mimeType`; optional `parentFolderId`, `mediaBase64`, `mediaMimeType`.

2. **Stub** — Metadata-only create forwards `name`, `mimeType`, `parentFolderId`; returns JSON with new `id`.

3. **Stub multipart args** — With `mediaBase64` + `mediaMimeType`, stub receives both (no real multipart in integration).

4. **No token** — Default port → `isError` without secrets.

5. **Registry** — Prior Epic 2 tools still listed.
