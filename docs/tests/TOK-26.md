# TOK-26 — Test plan (S2.4 get_file_metadata)

## Cases

1. **tools/list** — `get_file_metadata` with required `fileId` in `inputSchema`.

2. **Stub** — `tools/call` returns JSON matching stub (id, name, mimeType, owners, shared).

3. **No token** — `isError` without secrets.

4. **Registry** — Prior Epic 2 tools still listed.
