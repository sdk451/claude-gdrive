# TOK-23 — Test plan (S2.1 search_files)

## Cases

1. **tools/list exposes search_files** — After `initialize`, `tools/list` includes `search_files` with JSON Schema / Zod-derived `inputSchema` containing required `q` and optional `pageSize`, `pageToken`.

2. **tools/call stubbed Drive** — With injected `DriveFilesPort`, `tools/call` `search_files` passes `q` to the port and returns JSON text with file ids/names matching stub.

3. **Query forwarded to Google-shaped stub** — Integration asserts the port received expected `q` (and optional pagination args).

4. **Missing Drive port / token** — Default path returns structured `isError` without leaking secrets.

5. **Unknown tool** — Existing behaviour: unknown tool still errors (regression from TOK-19).
