---
title: UX Flows — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## 1. Onboarding / first-run

### 1.1 Plugin install (Cowork)

1. User goes to **Settings → Plugins → Browse** in Cowork (or pastes a GitHub URL / uploads a ZIP).
2. They install **Google Drive (Reliable)**.
3. The plugin manifests a connector card — "Google Drive (Reliable) — Not connected".
4. User clicks **Connect**.

### 1.2 OAuth consent

1. Browser opens the operator's MCP server `/authorize` endpoint with PKCE.
2. Server redirects to Google's consent screen with the requested scope (default `drive.file`).
3. User reviews scopes — described in plain English by the operator's OAuth client config — and clicks **Allow**.
4. Google redirects back to the MCP server's `/callback` with an auth code.
5. Server exchanges code for access + refresh tokens, encrypts the refresh token at rest, and binds the session to a hashed user id.
6. Server redirects the browser back to the Claude callback URL (`https://claude.ai/api/mcp/auth_callback` for hosted surfaces; loopback for Claude Code).
7. The connector card flips to "Connected".

### 1.3 First successful tool call

1. User asks Claude something Drive-shaped: _"Find my Q3 board deck."_
2. Claude calls `search_files` with a Drive query.
3. Server hits `files.list?q=...`, returns results within ≤ 3 s.
4. Claude renders the result inline.

**End-to-end target: ≤ 10 minutes** from plugin install to step 1.3.

## 2. Primary flows

### 2.1 Search → Read → Summarize

1. `search_files` returns 5–20 candidate files with id, name, mime type, owner, modified.
2. User picks one (or Claude infers).
3. `read_file_content` is called: server `files.export` for Docs Editors mime types, `files.get` for plain text. Binary mime types prompt Claude to use `download_file_content` instead.
4. Claude summarizes; user accepts or asks for follow-ups.

### 2.2 Create → Edit → Share

1. `create_file` produces a new Doc/Sheet/Slide/folder with `mimeType` and `name`.
2. `update_file` modifies content/metadata.
3. `share_file` adds permissions. **Destructive op:** Claude confirms target and role with the user before calling.

### 2.3 Folder browse

1. `list_folder` paginates through a folder; result includes `nextPageToken` for continued listing.
2. Claude renders a chunk and asks the user whether to continue.

### 2.4 Metadata + permissions inspection

1. `get_file_metadata` returns name, owner, size, modified, shared status.
2. `get_file_permissions` lists who has access. Useful for "who can see this?" questions.

## 3. Edge / failure flows

### 3.1 Auth expired

- A tool call after refresh-token revocation returns 401 from the MCP server.
- Claude surfaces: "Google Drive authorization expired. Please reconnect Google Drive in Settings → Connectors."
- Reconnect re-runs the consent flow; tokens are replaced server-side; existing sessions resume.

### 3.2 Transient Drive 5xx

- Server retries with exponential backoff (NF-05). User never sees the failure unless retries exhaust.
- On exhaustion: "Google Drive is having a bad minute — try again in a moment."

### 3.3 File not found / permission denied

- 404 / 403 from Drive: surface "I can't see that file with your current access" — never echo the file id unless the user provided it.

### 3.4 Indirect prompt injection in Drive content

- Drive content is treated as untrusted. Tool annotations and Claude's surface-level safeguards apply.
- Destructive ops (`share_file`, `move_file`, large `update_file`) require explicit user confirmation in chat.

### 3.5 Tools/list returns empty (the original bundled-connector bug)

- This is **not a UX state for v1** — it is an alarmable server-side bug.
- Server emits a structured log event `tools.list.empty` with session metadata; alerting fires at any non-zero rate.

## 4. Operator flows (self-hosting)

### 4.1 First deploy (Cloud Run, the default path)

1. Operator clones the repo, runs the documented `gcloud` deploy command.
2. They configure Secret Manager entries for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`.
3. They add `https://claude.ai/api/mcp/auth_callback` and (optionally) loopback URIs to the OAuth client.
4. They visit `/.well-known/oauth-authorization-server` and verify it returns metadata.
5. They run MCP Inspector against the server URL to validate `tools/list` and OAuth.

**Operator target: ≤ 30 minutes** from clone to a working `tools/list` from MCP Inspector.

### 4.2 Add a team member (Team plan)

1. Operator shares the plugin (ZIP or GitHub link) with the team.
2. Each member installs the plugin and clicks **Connect** — Google consent runs under their own account; tokens are per-user on the server.
3. No shared secrets between members.

### 4.3 Rotate session encryption key

1. Operator stages a new `SESSION_SECRET` in Secret Manager.
2. Server reads new key but accepts ciphertext from old key during a deprecation window (documented in `docs/observability.md`).
3. After window, old key is removed; sessions encrypted under the old key are evicted.

## 5. Accessibility & internationalization notes

- All human-facing strings (consent copy, error messages, README) are plain English at first; translatable strings are tagged in code with i18n keys for v2.
- Operator dashboards (logs, traces) must not rely on color alone to convey severity.
- Plugin README structure follows headings hierarchy so screen readers can navigate it.

## 6. Open UX questions

- Should v1 ship optional slash commands (`/gdrive:search`, `/gdrive:open`, `/gdrive:upload`) or save them for v1.1?
- Do we provide an in-product onboarding nudge ("connect Drive to get started") or rely on users discovering the connector card?
- For Claude Code's loopback flow, is the default browser-open acceptable on headless dev environments? Document workarounds.
- How do we surface partial-failure tool results (e.g., 50/100 results returned before a Drive timeout) without confusing the model?
