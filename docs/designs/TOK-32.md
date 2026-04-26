# TOK-32 — Design: S3.3 `share_file`

## Goal

Expose MCP tool `share_file` to **grant** a new ACL entry (`permissions.create`) or **revoke** one (`permissions.delete`), with explicit `action` so the model chooses the operation deliberately.

## API mapping

| `action` | Drive call                                                                 |
| -------- | -------------------------------------------------------------------------- |
| `grant`  | `POST /drive/v3/files/{fileId}/permissions` with JSON `{ type, role, … }`. |
| `revoke` | `DELETE /drive/v3/files/{fileId}/permissions/{permissionId}`.              |

## Grantee rules (client-side validation before calling Google)

- `granteeType` `user` or `group`: **`emailAddress`** required.
- `granteeType` `domain`: **`domain`** required.
- `granteeType` `anyone`: no email/domain.

## Annotations

Register with **`destructiveHint: true`** (sharing changes ACL / exposure).

## Response shape

- **grant:** `{ "action": "grant", "permissionId", "type", "role", … }` mapped from the created `Permission` (no raw `emailAddress` in output).
- **revoke:** `{ "action": "revoke", "deleted": true }` on success (`204` / empty body).
