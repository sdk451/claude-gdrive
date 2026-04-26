# TOK-42 — Design: S5.3 Indirect prompt-injection mitigations

## Goal

Address **indirect prompt injection** from **untrusted Drive content** (see `docs/prd.md` §8, `docs/architecture.md` security model): make **client-visible mitigations** explicit via MCP tool **`annotations`**, and publish an operator-facing **security note** linked from the README.

## Behaviour

1. **Destructive / state-changing tools** — `create_file`, `update_file`, `move_file`, and `share_file` MUST advertise **`destructiveHint: true`** in `tools/list` so hosts can gate confirmations (per constitution principle 5).
2. **Read-mostly tools** — MUST NOT falsely advertise `destructiveHint: true` (today: `search_files`, `list_folder`, `read_file_content`, `download_file_content`, `get_file_metadata`, `get_file_permissions`; `list_folder` keeps **`readOnlyHint: true`**).
3. **Documentation** — New page **`docs/security/indirect-prompt-injection.md`** explains the threat model, tool hints, least-privilege scopes, and operator practices; **README** and **architecture** link to it.

## Tests

- Contract: single Vitest file walks `tools/list` and asserts the destructive set vs `GDRIVE_MCP_TOOL_NAMES` coverage.

## Non-goals

- New MCP tools, server-side content scanning, or automated “safe prompt” filtering.
