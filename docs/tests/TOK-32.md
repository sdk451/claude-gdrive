# TOK-32 — Test plan (S3.3 `share_file`)

## Cases

1. **tools/list** — `share_file` with `action` grant/revoke; required fields per branch; `destructiveHint: true`.

2. **Grant stub** — `action: grant` with `user` + `emailAddress` forwards to port; JSON includes `permissionId`.

3. **Revoke stub** — `action: revoke` + `permissionId` hits delete path.

4. **Validation** — `grant` + `user` without `emailAddress` → `isError`. `revoke` without `permissionId` → `isError`.

5. **No token** — Default port → `isError`.

6. **Registry** — `share_file` appears alongside prior tools through `move_file`.
