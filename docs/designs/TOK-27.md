# TOK-27 — S2.5 `get_file_permissions`

## Goal

Expose MCP tool `get_file_permissions` that lists sharing ACL entries for a file via Drive `permissions.list` (PRD §5.2, architecture).

## Approach

1. **Port** — `listFilePermissions({ fileId, pageSize?, pageToken? })` → `{ permissions: FilePermissionRef[]; nextPageToken? }`. Each ref: `id`, `type`, `role`, optional `displayName`, optional `domain` (for `domain` / `anyone` grants). **Omit `emailAddress`** from the mapped shape to keep agent-facing output lower-PII; users can use Drive UI for raw emails if needed.

2. **Fetch** — `GET .../files/{id}/permissions` with `fields=nextPageToken,permissions(id,type,role,domain,displayName)`; same bearer token gate as other port methods.

3. **MCP** — Register `get_file_permissions` with Zod `fileId` plus optional pagination; JSON text result.

4. **Tests** — Contract `inputSchema` + `tools/list`; integration stub + no-token; extend every `DriveFilesPort` stub.

## Verification

`docs/tests/TOK-27-targets.txt`; typecheck, lint, `lint:md`, targeted script, full `pnpm test`.
