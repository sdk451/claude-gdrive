# TOK-27 — Test plan (S2.5 get_file_permissions)

## Cases

1. **tools/list** — Existing tools unchanged; `get_file_permissions` appears with required `fileId` and optional pagination in `inputSchema`.

2. **Stub** — `tools/call` returns JSON with `permissions` array and optional `nextPageToken`; stub receives `fileId` (and optional page args).

3. **No token** — default port → `isError` without secrets.

4. **Registry** — Prior Epic 2 tools still listed alongside the new tool.
