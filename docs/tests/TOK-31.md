# TOK-31 — Test plan (S3.2 `move_file`)

## Cases

1. **tools/list** — `move_file` present; required `fileId`, `addParentFolderId`, `removeParentFolderId`; `annotations.destructiveHint === true`.

2. **Stub** — `tools/call` forwards all three ids to `DriveFilesPort.moveFile`; JSON result echoed.

3. **No token** — Default port → `isError` (not connected).

4. **Registry** — Prior tools including `update_file` still listed; `move_file` included.
