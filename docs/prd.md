---
title: PRD — Google Drive Cowork Connector
project: gdrive-cowork-connector
date: 2026-04
status: draft
---

## 1. Overview

### 1.1 Problem

Many users experience persistent failures with Google Drive in Cowork / Claude Code where Drive appears “Connected” but **no tools are available** (or the connector fails to pass through), while other connectors work:

- [#39062](https://github.com/anthropics/claude-code/issues/39062)
- [#39422](https://github.com/anthropics/claude-code/issues/39422)
- [#32450](https://github.com/anthropics/claude-code/issues/32450)

### 1.2 Proposed solution

Ship a **self-hosted remote MCP server** (OAuth + Streamable HTTP) that provides reliable Google Drive tooling, and package it as an installable **Cowork/Claude plugin** for “one-click” onboarding.

This follows Anthropic’s recommended pattern of shipping **an MCP server plus a plugin wrapper** ([What should I build: MCP, plugin, or both?](https://claude.com/docs/connectors/building/what-to-build.md)).

## 2. Goals and non-goals

### 2.1 Goals

- Replace broken Drive connector behavior with a reliable alternative usable in Cowork + Claude Code.
- Installation by non-developers in **under 10 minutes** (plugin install + OAuth connect).
- Correct MCP implementation (Streamable HTTP transport; OAuth per supported specs) so it works across Claude surfaces ([Building custom connectors](https://claude.com/docs/connectors/building/index.md), [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)).
- Least-privilege access by default.
- Tool surface at least as capable as Google’s own Drive MCP tool set, with pragmatic additions (folder listing, moving, sharing).

### 2.2 Non-goals (v1)

- Multi-tenant SaaS (this is self-hosted by a person/team/org).
- Workspace Admin APIs (audit logs, user management).
- Google Chat / Meet / Forms.

## 3. Users and use cases

### 3.1 Primary users

- **Individual Cowork / Claude Code users** who need Drive access for daily knowledge work.
- **Team plan owners / IT** who want to self-host the connector under their own Google Cloud project and policies.
- **Developers** extending the tool set.

### 3.2 Top user stories

- Install plugin, connect Drive, and immediately search/read/create docs in one session.
- Team owner deploys server once and distributes plugin; each member authorizes with their own Google account.

## 4. Scope

### 4.1 In scope (v1)

Deliverables:

- Remote MCP server (Streamable HTTP + OAuth + tool registry).
- Plugin bundle referencing the remote server, plus at least one skill file and optional slash commands.
- Documentation for self-host deployment and setup.

### 4.2 Out of scope / backlog (v2+)

- Shared Drives / Team Drives (additional API surface + scopes).
- Sheets cell-level operations (Sheets API).
- Docs surgical editing (Docs API range ops).
- Webhooks / change notifications (`drive.changes`).

## 5. Functional requirements

### 5.1 MCP server (Must)

| ID   | Requirement                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Implement MCP **Streamable HTTP** transport (`POST /mcp`, `GET /mcp`, `DELETE /mcp`)                                                                                      |
| F-02 | Correctly assign/validate `mcp-session-id` per spec                                                                                                                       |
| F-03 | Register and describe all tools in `tools/list` responses                                                                                                                 |
| F-04 | Return text-based tool results (and image results where applicable)                                                                                                       |
| F-05 | Expose `/.well-known/oauth-authorization-server` metadata                                                                                                                 |
| F-06 | Support Dynamic Client Registration (DCR) or equivalent supported onboarding path (e.g. CIMD)                                                                             |
| F-07 | Implement PKCE for authorization code flow                                                                                                                                |
| F-08 | Handle Google OAuth refresh automatically                                                                                                                                 |
| F-10 | Isolate access tokens per user session; prevent cross-user leakage                                                                                                        |
| F-11 | Support Claude hosted callback `https://claude.ai/api/mcp/auth_callback` ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)) |

### 5.2 Google Drive tools

Must-have:

| Tool                    | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `search_files`          | Search by metadata/full-text (Drive query syntax)     |
| `read_file_content`     | Read Docs/Sheets/Slides exports + plaintext           |
| `download_file_content` | Download binary content (PDF/images/Office)           |
| `get_file_metadata`     | Name, MIME type, owner, size, modified, shared status |
| `get_file_permissions`  | List sharing permissions                              |
| `create_file`           | Create Docs/Sheets/Slides or folders                  |

Should-have:

| Tool          | Purpose                          |
| ------------- | -------------------------------- |
| `update_file` | Update content/metadata          |
| `move_file`   | Move files between folders       |
| `share_file`  | Add/revoke sharing permissions   |
| `list_folder` | List folder contents (paginated) |

### 5.3 Plugin wrapper

| ID   | Requirement                                                                   |
| ---- | ----------------------------------------------------------------------------- |
| P-01 | Include `.claude-plugin/plugin.json`                                          |
| P-02 | Include `.mcp.json` referencing remote server URL (and auth config as needed) |
| P-03 | Include at least one skill file (Drive search syntax guidance)                |
| P-04 | Optional slash commands `/gdrive:search`, `/gdrive:open`, `/gdrive:upload`    |
| P-05 | Installable via Cowork plugin UI (zip or GitHub)                              |
| P-07 | README includes complete server setup guide                                   |

## 6. Non-functional requirements

| ID    | Requirement                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NF-01 | Public internet reachability from Anthropic egress IPs (outbound IPv4 `160.79.104.0/21`) ([IP addresses](https://platform.claude.com/docs/en/api/ip-addresses))            |
| NF-02 | Typical tool round-trip \(MCP → Drive API → MCP\) under 3 seconds                                                                                                          |
| NF-03 | Refresh tokens encrypted at rest (AES-256-GCM)                                                                                                                             |
| NF-04 | No credentials/tokens in logs                                                                                                                                              |
| NF-05 | Retry transient Drive API failures with exponential backoff (see Google guidance: [Handle errors](https://developers.google.com/workspace/drive/api/guides/handle-errors)) |
| NF-07 | Runs on Node.js 22 LTS on Linux (amd64/arm64)                                                                                                                              |
| NF-08 | Structured JSON logs with request id + hashed session id + tool name + outcome                                                                                             |

## 7. UX and onboarding requirements

- Users must be able to add the connector as a **custom connector** in Claude surfaces ([Third party connectors with remote MCP](https://claude.com/docs/connectors/custom/remote-mcp.md)).
- Onboarding must explicitly document the different redirect URI expectations:
  - Hosted Claude surfaces: `https://claude.ai/api/mcp/auth_callback`
  - Claude Code loopback redirect handling via client metadata ([Claude Code client metadata](https://claude.ai/oauth/claude-code-client-metadata))
- Provide “known-good” test prompts to confirm end-to-end function.

## 8. Risks and mitigations

- **OAuth complexity**: follow Claude’s auth guidance; keep discovery endpoints fast; ensure correct 401 + `WWW-Authenticate` behavior for auth challenges (see [Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md) for correct challenge semantics).
- **Prompt injection from Drive content**: treat Drive files as untrusted; require user confirmation on destructive operations; consider safe defaults. Google explicitly warns about indirect prompt injection in their Drive MCP guidance ([Configure the Drive MCP server](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server)).
- **Restricted scopes verification**: default to narrower scopes where feasible; document when broader scopes are necessary and the verification implications ([Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).

## 9. Acceptance criteria

The project is complete for v1 when:

1. A Cowork user can install the plugin, connect Drive via OAuth, and see Drive tools available in-session.
2. These workflows succeed end-to-end in Cowork:
   - Search for a file by name
   - Read a Google Doc’s content
   - Create a new Google Doc with Claude-generated content
3. MCP Inspector validates tool schemas and the OAuth flow ([MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)).
4. Cloud Run deployment works from a fresh deploy using documented steps.
5. Token refresh works silently after access token expiry.

## 10. References

- Requirements seed: `docs/_seed/requirements-brief.md`
- MCP + Claude connector docs:
  - [Building custom connectors](https://claude.com/docs/connectors/building/index.md)
  - [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)
  - [Testing your connector](https://claude.com/docs/connectors/building/testing.md)
  - [What should I build: MCP, plugin, or both?](https://claude.com/docs/connectors/building/what-to-build.md)
  - [Plugins overview](https://claude.com/docs/plugins/overview.md)
- MCP spec:
  - [Authorization (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
  - [Tools](https://modelcontextprotocol.io/specification/latest/server/tools)
- Google Drive:
  - [Drive API files](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
  - [Drive API permissions](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions)
  - [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
  - [Handle errors](https://developers.google.com/workspace/drive/api/guides/handle-errors)
  - [Configure the Drive MCP server](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server)
