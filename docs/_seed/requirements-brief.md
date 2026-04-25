# Requirements Brief: Google Drive Cowork Connector

**Project:** `gdrive-cowork-connector`
**Date:** April 2026
**Status:** Pre-build scoping

---

## 1. Background & Motivation

Anthropic's bundled Google Drive connector (`drivemcp.googleapis.com`) has a well-documented and reproducible failure mode across Cowork and Claude Code:

- The connector shows as "Connected" in Settings but exposes **zero tools** to the AI.
- Gmail and Google Calendar connectors from the same Google workspace integration work correctly.
- The failure persists after disconnecting and reconnecting, and across macOS and Windows.
- Affected users cannot list, search, or read Drive files via Cowork — defeating the purpose of the connector entirely.
- Multiple open GitHub issues on `anthropics/claude-code` confirm the bug is widespread and unresolved as of April 2026 (issues #32450, #39422, #39062).

This project delivers a **self-hosted remote MCP server** that Claude and Cowork can connect to as a custom connector, packaged as an **installable Cowork plugin** for one-click deployment.

---

## 2. Goals

1. Provide reliable Google Drive access within Cowork and Claude Code, fully replacing the broken bundled connector.
2. Package the solution as a Cowork plugin installable by non-developers in under 10 minutes.
3. Implement the MCP protocol correctly (Streamable HTTP, OAuth 2.0 per MCP spec) so it works across all Claude clients — claude.ai, Cowork, Claude Desktop, Claude Code, and Claude Mobile.
4. Follow least-privilege security principles; users should never grant more Drive access than needed.
5. Deliver a tool set that is a superset of Google's official 7-tool set, addressing known gaps (folder listing, file moving, permission management).

---

## 3. Non-Goals

- This project does **not** replace or fix Anthropic's official connector — it is an independent alternative.
- This project does **not** provide a multi-tenant SaaS offering (it is designed for personal, team, or enterprise self-hosting).
- Google Workspace Admin APIs (audit logs, user management) are out of scope.
- Google Workspace Chat, Meet, and Forms are out of scope for v1.

---

## 4. Functional Requirements

### 4.1 MCP Server

| ID | Requirement | Priority |
|----|-------------|----------|
| F-01 | The server MUST implement MCP Streamable HTTP transport (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) | Must |
| F-02 | The server MUST correctly assign and validate `mcp-session-id` headers per the MCP spec | Must |
| F-03 | The server MUST register and describe all tools in `tools/list` responses | Must |
| F-04 | The server MUST return text-based tool results (and image results where applicable) | Must |
| F-05 | The server MUST expose a `/.well-known/oauth-authorization-server` metadata endpoint | Must |
| F-06 | The server MUST support Dynamic Client Registration (DCR) | Must |
| F-07 | The server MUST implement PKCE in the OAuth authorization code flow | Must |
| F-08 | The server MUST handle Google OAuth token refresh automatically, without user re-authentication | Must |
| F-09 | The server SHOULD continue to support SSE transport for backward compatibility | Should |
| F-10 | The server MUST isolate access tokens per user session; no cross-user data leakage | Must |
| F-11 | Claude's OAuth callback URL (`https://claude.ai/api/mcp/auth_callback`) MUST be an allowed redirect URI | Must |

### 4.2 Google Drive Tools

| Tool | Description | Priority |
|------|-------------|----------|
| `search_files` | Full-text and metadata search using Drive query syntax (`q` param) | Must |
| `read_file_content` | Read content of Google Docs, Sheets, Slides, and plain text files | Must |
| `download_file_content` | Download binary file content (PDF, images, Office files) | Must |
| `get_file_metadata` | Retrieve name, MIME type, owner, size, modified date, shared status | Must |
| `get_file_permissions` | List all sharing permissions for a file | Must |
| `create_file` | Create Google Docs, Sheets, Slides, or plain folders | Must |
| `update_file` | Update file content or metadata | Should |
| `move_file` | Move a file to a different folder | Should |
| `share_file` | Add or revoke sharing permissions | Should |
| `list_folder` | List files within a specific folder, with pagination | Should |

### 4.3 Cowork Plugin

| ID | Requirement | Priority |
|----|-------------|----------|
| P-01 | Plugin MUST include a valid `plugin.json` manifest under `.claude-plugin/` | Must |
| P-02 | Plugin MUST include `.mcp.json` referencing the remote server URL and OAuth credentials | Must |
| P-03 | Plugin MUST include at least one skill file providing Google Drive search syntax guidance | Must |
| P-04 | Plugin SHOULD include slash commands: `/gdrive:search`, `/gdrive:open`, `/gdrive:upload` | Should |
| P-05 | Plugin MUST be installable via Cowork's plugin UI (zip upload or GitHub marketplace) | Must |
| P-06 | Plugin SHOULD be installable via `claude plugin install` CLI | Should |
| P-07 | Plugin README MUST include a complete setup guide for the remote server | Must |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | **Availability:** The server must be reachable over the public internet from Anthropic's published IP ranges at all times |
| NF-02 | **Latency:** Tool call round-trip (MCP request → Drive API → MCP response) should complete within 3 seconds for typical operations |
| NF-03 | **Security:** OAuth refresh tokens must be encrypted at rest using AES-256-GCM |
| NF-04 | **Security:** No credentials or access tokens may appear in application logs |
| NF-05 | **Reliability:** The server must handle Google API transient errors with exponential back-off retry |
| NF-06 | **Compliance:** OAuth consent screen must clearly describe what Drive data is accessed |
| NF-07 | **Portability:** Server must run on Node.js 22 LTS on Linux (amd64 and arm64) |
| NF-08 | **Observability:** All MCP requests and Google API calls must produce structured JSON log entries with request ID, user session ID (hashed), tool name, and outcome |

---

## 6. User Stories

**As a Cowork user on Pro plan,** I want to install the Google Drive plugin and connect my Drive account in under 10 minutes, so that I can ask Claude to find and summarise my documents without any technical setup beyond clicking "Authorise".

**As a Cowork user,** I want Claude to be able to search my Drive, read a document I specify, and create a new summary document — all in a single Cowork session — so I don't have to copy-paste content manually.

**As a Team plan owner,** I want to self-host the MCP server for my organisation and distribute the plugin to team members, so that the connector uses our own Google Cloud project and our IT policies govern data access.

**As a developer building on top of this project,** I want the MCP server codebase to be straightforward TypeScript with well-documented tool handlers, so that I can add custom tools (e.g., Google Sheets-specific operations) without reverse-engineering the protocol.

---

## 7. Out-of-Scope (v1) / Backlog (v2+)

| Feature | Notes |
|---------|-------|
| Google Shared Drives (Team Drives) | v2 — requires additional API scope |
| Google Sheets cell-level read/write | v2 — Sheets API is separate |
| Google Docs surgical editing (insert/delete ranges) | v2 — Docs API is separate |
| Google Calendar integration | Not in scope — Calendar connector works reliably already |
| Publish to Anthropic's official connectors directory | v2 — requires Google OAuth app verification and Anthropic review process |
| Multi-tenant hosted SaaS | Not in scope — architectural extension, not a v1 concern |
| Webhook / push notifications on Drive changes | v2 — requires `drive.changes` scope and a persistent webhook endpoint |

---

## 8. Dependencies & Constraints

| Dependency | Notes |
|------------|-------|
| Anthropic plan | Users must be on Pro, Max, Team, or Enterprise to add custom connectors |
| Google Cloud project | The server operator must create a GCP project, enable Drive API, and configure an OAuth consent screen |
| Google OAuth verification | Apps requesting `drive.readonly` or `drive` scopes for external users require Google's OAuth app verification process. For internal (Workspace) use only, `Internal` audience bypasses this |
| Anthropic IP ranges | The server must be reachable from Anthropic's cloud; a VPN or private network is not sufficient |
| Claude OAuth callback | `https://claude.ai/api/mcp/auth_callback` must be an authorised redirect URI in the GCP OAuth client |

---

## 9. Acceptance Criteria

The project is considered complete for v1 when:

1. A Cowork user on Pro plan can install the plugin, click "Connect", complete the Google OAuth flow, and have Drive tools available in their session — with no manual token configuration.
2. The following tool calls succeed end-to-end in a Cowork session:
   - Search for a file by name
   - Read the content of a Google Doc
   - Create a new Google Doc with Claude-generated content
3. The MCP Inspector confirms all tools are listed correctly and the OAuth flow completes without errors.
4. The server runs without error on a fresh Cloud Run deployment using the provided `Dockerfile` and `README` instructions.
5. Token refresh works silently after the initial access token expires (typically 1 hour), without prompting the user to re-authenticate.
6. A team plan owner can configure the server URL and distribute the plugin ZIP to team members, who can each authenticate with their own Google account.

---

## 10. References

- [Anthropic: Building custom connectors via remote MCP servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Anthropic: Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [MCP Authorization Spec (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [MCP TypeScript SDK — remote server examples](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/src/examples/server)
- [Google Drive API v3 reference](https://developers.google.com/workspace/drive/api/reference/rest/v3)
- [Google: Configure the Drive MCP server](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server)
- [Google Drive API scopes reference](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Anthropic knowledge-work-plugins (plugin structure reference)](https://github.com/anthropics/knowledge-work-plugins)
- [Known bug: Drive connector shows Connected but no tools load (#39062)](https://github.com/anthropics/claude-code/issues/39062)
- [Known bug: Drive connector not passed through to Claude Code (#39422)](https://github.com/anthropics/claude-code/issues/39422)
