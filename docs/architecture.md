---
title: Architecture — Google Drive Cowork Connector
project: gdrive-cowork-connector
date: 2026-04
status: draft
---

## Summary

This project is a **self-hosted remote MCP server** plus an installable **Cowork/Claude plugin** wrapper that provides reliable Google Drive access, intended as a practical replacement for the currently unreliable first-party Drive connector behavior observed in Cowork / Claude Code.

## Problem context

Users frequently report a failure mode where Google Drive shows as “Connected” but exposes **no tools** (or fails to pass through to Claude Code), while other connectors (Gmail, Calendar) work:

- [Claude Code issue: “Connected but no available tools”](https://github.com/anthropics/claude-code/issues/39062)
- [Claude Code issue: Drive not passed through to Claude Code](https://github.com/anthropics/claude-code/issues/39422)
- [Claude Code issue: Drive not loading in VS Code extension](https://github.com/anthropics/claude-code/issues/32450)

This project provides an alternative connector surface that we control end-to-end: tool registry, transport, auth, and Drive API calls.

## High-level architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│ Claude surfaces (Cowork, Claude Desktop, Claude.ai, Claude Code)  │
│                                                                  │
│  Plugin wrapper (recommended)                                    │
│  - .claude-plugin/plugin.json                                    │
│  - .mcp.json (points to remote MCP URL)                          │
│  - skills/ + commands/ (usage guidance + slash commands)         │
└──────────────────────────────────────────────────────────────────┘
                     │ Streamable HTTP (MCP)
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ Remote MCP Server (self-hosted)                                  │
│                                                                  │
│  HTTP layer (Hono/Node)                                          │
│  - POST /mcp, GET /mcp, DELETE /mcp                              │
│  - OAuth discovery + authorization endpoints                     │
│                                                                  │
│  MCP core (@modelcontextprotocol/sdk)                            │
│  - tool registry                                                 │
│  - session + token isolation                                     │
│                                                                  │
│  Google Drive adapter (googleapis Drive v3)                      │
└──────────────────────────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌───────────────────────────────┐
│ Google Drive API v3 (per user) │
└───────────────────────────────┘
```

## Components

### Plugin wrapper (distribution)

Why ship a plugin as well as an MCP server:

- The MCP server is the **live tool surface** Claude calls.
- The plugin is a **shareable bundle** that packages skills + slash commands + the connector reference, which improves setup and usability. See [What should I build: MCP, plugin, or both?](https://claude.com/docs/connectors/building/what-to-build.md) and [Plugins overview](https://claude.com/docs/plugins/overview.md).

Expected plugin bundle layout (file-based; no code execution required):

```text
gdrive-connector/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── skills/
│   └── gdrive-usage.md
├── commands/
│   ├── search.md
│   ├── open.md
│   ├── upload.md
│   └── share.md
└── README.md
```

Minimal examples (shape only; values are placeholders):

**`.claude-plugin/plugin.json`**

```json
{
  "id": "com.yourorg.gdrive-connector",
  "name": "Google Drive (Reliable)",
  "description": "Self-hosted MCP connector for Google Drive",
  "version": "1.0.0",
  "author": "Your Org"
}
```

**`.mcp.json`**

```json
{
  "mcpServers": {
    "gdrive": {
      "type": "http",
      "url": "https://your-server.example.com/mcp"
    }
  }
}
```

### Remote MCP server (runtime)

Responsibilities:

- **MCP transport**: implement Streamable HTTP (and optionally legacy HTTP+SSE for compatibility). Claude recommends Streamable HTTP and notes SSE is being deprecated ([Building custom connectors](https://claude.com/docs/connectors/building/index.md)).
- **Tool registry**: return tools via `tools/list` and handle `tools/call` (MCP tools spec: [Tools](https://modelcontextprotocol.io/specification/latest/server/tools)).
- **OAuth**: support an OAuth flow that works across hosted Claude surfaces and Claude Code. Key callback facts:
  - Hosted Claude surfaces (Claude.ai web, Desktop, mobile, Cowork): redirect URI is `https://claude.ai/api/mcp/auth_callback` ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)).
  - Claude Code uses loopback redirects; its Client ID metadata includes `http://localhost/callback` and `http://127.0.0.1/callback` ([Claude Code client metadata](https://claude.ai/oauth/claude-code-client-metadata)).
- **Per-user token isolation**: each user session maps to exactly one user’s Google OAuth token set; no cross-user leakage.
- **Drive API calls**: translate MCP tool calls into Google Drive API v3 operations.

OAuth flow (conceptual):

```text
Claude (MCP client)         MCP Server               Google Auth
       │                        │                          │
       │── GET /.well-known ───►│                          │
       │◄── OAuth metadata ─────│                          │
       │                        │                          │
       │── Authorization req ──►│                          │
       │                        │── redirect to Google ───►│
       │◄── redirect to browser─│                          │
       │                        │                          │
       │ [User logs in & consents]                         │
       │                        │◄── auth code ────────────│
       │                        │── exchange for tokens ──►│
       │                        │◄── access + refresh ─────│
       │                        │                          │
       │── MCP tool calls ─────►│── Drive API calls ──────►│
       │◄── tool results ───────│◄── responses ────────────│
```

### Tool surface

Required (“Must”) tools (from the requirements brief):

- `search_files`
- `read_file_content`
- `download_file_content`
- `get_file_metadata`
- `get_file_permissions`
- `create_file`

Should-have tools:

- `update_file`
- `move_file`
- `share_file`
- `list_folder`

Tool → Drive API mapping (illustrative):

| Tool                    | Drive API                                       |
| ----------------------- | ----------------------------------------------- |
| `search_files`          | `files.list` (`q` param)                        |
| `read_file_content`     | `files.export` (Docs Editors) / `files.get`     |
| `download_file_content` | `files.get` (`alt=media`)                       |
| `get_file_metadata`     | `files.get` (`fields=...`)                      |
| `get_file_permissions`  | `permissions.list`                              |
| `create_file`           | `files.create`                                  |
| `update_file`           | `files.update`                                  |
| `move_file`             | `files.update` (`addParents` / `removeParents`) |
| `share_file`            | `permissions.create` / `permissions.delete`     |
| `list_folder`           | `files.list` (`'<folderId>' in parents`)        |

## Deployment options

### Option A — Cloud Run (recommended)

- Stateless compute + HTTPS + autoscaling.
- Token/session storage via Redis (or an equivalent durable store), with refresh tokens encrypted at rest.

```text
GitHub repo → CI → Cloud Run
                 │
             Secret Manager
             (OAuth + session keys)
```

### Option B — Cloudflare Workers

- Edge deployment.
- Durable Objects for session state.

### Option C — VPS / Docker

- Reverse proxy (TLS termination) → Node service → Redis.

## Security model

- **Least-privilege scopes**: prefer per-file access where possible; request broader scopes only when needed. Google scope sensitivity categories are documented in [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- **PKCE**: required for OAuth authorization code flows for public clients.
- **No secrets in logs**: tokens and credentials must never appear in logs.
- **Encrypt refresh tokens at rest**: AES-256-GCM (requirement NF-03).
- **Network allowlisting** (optional): Anthropic egress for outbound requests is stable; see [IP addresses](https://platform.claude.com/docs/en/api/ip-addresses) (outbound IPv4 `160.79.104.0/21`).
- **Indirect prompt injection**: treat Drive content as untrusted input; follow standard mitigations (Google’s Drive MCP guide explicitly calls out indirect prompt injection risk: [Configure the Drive MCP server](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server)).

## Key design decisions

| Decision                            | Rationale                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streamable HTTP first               | Claude supports it across surfaces; legacy HTTP+SSE is being deprecated ([Building custom connectors](https://claude.com/docs/connectors/building/index.md)).                         |
| Server + plugin                     | MCP server provides tools; plugin improves onboarding, reuse, and discoverability of “how to use it” ([What to build](https://claude.com/docs/connectors/building/what-to-build.md)). |
| TypeScript + official SDK           | Best-maintained path for protocol compliance and tooling.                                                                                                                             |
| Per-user OAuth (no service account) | Mirrors the user’s Drive permissions and reduces blast radius.                                                                                                                        |

## Testing & validation

- **Custom connector testing**: Claude recommends testing via Settings → Connectors → Add custom connector; there’s no staging environment ([Testing your connector](https://claude.com/docs/connectors/building/testing.md)).
- **MCP Inspector**: validate tool schemas, auth flows, and transport behavior ([MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)).
