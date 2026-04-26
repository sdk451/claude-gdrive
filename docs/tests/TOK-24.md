# TOK-24 — Test plan (S2.2 read_file_content)

## Cases

1. **tools/list** — Includes `read_file_content` with `inputSchema` requiring `fileId` and optional `exportMimeType`.

2. **Stubbed port** — `tools/call` returns JSON body matching stub (`encoding`, `data`, `mimeType`).

3. **Export path** — Stub receives `exportMimeType` when tool passes it (Google Docs → `text/plain`).

4. **No token** — Default app returns `isError` without secrets.

5. **Registry** — `tools/list` still lists `search_files` (regression).
