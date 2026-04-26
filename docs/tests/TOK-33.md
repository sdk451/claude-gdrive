# TOK-33 — Test plan (S3.4 `list_folder`)

## Cases

1. **tools/list** — `list_folder` with required `folderId`, optional pagination; `readOnlyHint: true`.

2. **Stub** — `tools/call` forwards `folderId` / `pageSize` / `pageToken` to `DriveFilesPort.listFolder`.

3. **No token** — Default port → `isError`.

4. **Registry** — `list_folder` listed after existing Epic 3 tools.
