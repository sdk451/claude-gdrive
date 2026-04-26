# TOK-26 — S2.4 `get_file_metadata`

## Goal

Expose MCP tool `get_file_metadata` returning name, MIME type, size, modified time, shared flag, and owner display info via Drive `files.get` with explicit `fields` (PRD §5.2, architecture).

## Approach

1. **Port** — `getFileMetadata({ fileId })` → normalized `FileMetadataResult` (`id`, `name`, optional `mimeType`, `size`, `modifiedTime`, `shared`, `owners[]` with `displayName` / `permissionId` only — no emails in mapped shape).

2. **Fetch** — `GET .../files/{id}?fields=id,name,mimeType,size,modifiedTime,shared,owners(displayName,permissionId)`; same token gate.

3. **MCP** — Register `get_file_metadata` with Zod `fileId`; JSON text result.

4. **Tests** — Contract `inputSchema`; integration stub + no-token; extend all `DriveFilesPort` stubs.

## Out of scope

- Full `permissions.list` / ACL detail (separate tool).
- F-10 session tokens.

## Verification

`docs/tests/TOK-26-targets.txt`; typecheck, lint, targeted script, full test.
