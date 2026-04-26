# TOK-25 — Test plan (S2.3 download_file_content)

## Cases

1. **tools/list** — `download_file_content` present; `inputSchema` requires `fileId`.

2. **Stub** — `tools/call` returns JSON with `mimeType` and `base64`; stub receives `fileId`.

3. **No token** — Default `createApp()` → `isError`, no secrets.

4. **Registry** — `search_files` and `read_file_content` still listed.
