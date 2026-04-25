# Architecture: Google Drive Cowork Connector

> A custom remote MCP server + Cowork plugin that provides reliable Google Drive access, addressing the well-documented failures in Anthropic's bundled connector.

---

## 1. Problem Context

Anthropic's official Google Drive connector (via `drivemcp.googleapis.com`) has a class of persistent, confirmed bugs:

- **Tools don't load** — the connector shows "Connected" in the UI but exposes zero MCP tools to Claude or Cowork.
- **Claude Code passthrough failure** — Gmail and Google Calendar connectors pass through fine; Google Drive tools silently drop.
- **Per-conversation opt-in gap** — the connector requires opt-in in claude.ai web UI with no equivalent mechanism in Claude Code / Cowork desktop sessions.
- **OAuth state corruption** — reconnecting does not reliably fix the issue; `claudeAiMcpEverConnected` state tracking is inconsistent.

The solution is a **self-hosted remote MCP server** that you control entirely, packaged as a **Cowork plugin** so it installs with a single click.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User / Claude Desktop               │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │   Cowork Plugin  │    │   claude.ai / Cowork  │  │
│  │  ─────────────── │    │  ─────────────────── │  │
│  │  .claude-plugin/ │    │  Settings > Connectors │  │
│  │    plugin.json   │◄───│  (OAuth callback)      │  │
│  │  .mcp.json       │    └───────────────────────┘  │
│  │  skills/         │                               │
│  │  commands/       │                               │
│  └────────┬─────────┘                               │
└───────────┼─────────────────────────────────────────┘
            │ Streamable HTTP (MCP Protocol)
            │ from Anthropic cloud infra → public internet
            ▼
┌─────────────────────────────────────────────────────┐
│              Remote MCP Server (self-hosted)         │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Express / Hono HTTP layer                    │  │
│  │  POST /mcp  ·  GET /mcp (SSE)  ·  DELETE /mcp│  │
│  │  OAuth endpoints: /authorize  /callback  /token│  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                    │
│  ┌──────────────▼───────────────────────────────┐  │
│  │  MCP Server Core (@modelcontextprotocol/sdk)  │  │
│  │  ─────────────────────────────────────────── │  │
│  │  Tool registry (8+ tools)                    │  │
│  │  Session manager (per-user token isolation)  │  │
│  │  OAuth middleware (PKCE + token refresh)     │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                    │
│  ┌──────────────▼───────────────────────────────┐  │
│  │  Google Drive Adapter                         │  │
│  │  googleapis Node.js SDK (Drive v3)           │  │
│  └──────────────┬───────────────────────────────┘  │
└─────────────────┼───────────────────────────────────┘
                  │ HTTPS / REST
                  ▼
      ┌─────────────────────┐
      │  Google Drive API v3 │
      │  (per-user OAuth)    │
      └─────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 Cowork Plugin Package

The plugin is a file-based bundle that installs into Cowork with no code execution on the user's machine.

```
gdrive-connector/
├── .claude-plugin/
│   └── plugin.json          # Manifest — name, version, description
├── .mcp.json                # Points to the remote MCP server URL
├── skills/
│   └── gdrive-usage.md      # Domain knowledge: file organisation, search syntax
├── commands/
│   ├── search.md            # /gdrive:search  — full-text search
│   ├── open.md              # /gdrive:open    — open a file by name or ID
│   ├── upload.md            # /gdrive:upload  — create/upload a file
│   └── share.md             # /gdrive:share   — manage permissions
└── README.md
```

**`plugin.json` structure:**
```json
{
  "id": "com.yourorg.gdrive-connector",
  "name": "Google Drive (Reliable)",
  "description": "Self-hosted MCP connector for Google Drive — fixes tool-loading issues in the bundled connector",
  "version": "1.0.0",
  "author": "Your Org"
}
```

**`.mcp.json` structure:**
```json
{
  "mcpServers": {
    "gdrive": {
      "type": "http",
      "url": "https://your-server.example.com/mcp",
      "oauth": {
        "clientId": "YOUR_GOOGLE_OAUTH_CLIENT_ID",
        "clientSecret": "YOUR_GOOGLE_OAUTH_CLIENT_SECRET"
      }
    }
  }
}
```

---

### 3.2 Remote MCP Server

The server must be publicly reachable from Anthropic's cloud IP ranges. It is responsible for:

1. **MCP Protocol compliance** — Streamable HTTP transport (`POST /mcp`, `GET /mcp`, `DELETE /mcp`), correct `mcp-session-id` header handling, and tool registration per the MCP spec.
2. **OAuth 2.0 flow** — Acting as an OAuth proxy between Claude (the MCP client) and Google's authorization servers. Supports Dynamic Client Registration (DCR) per the MCP 2025-03-26 auth spec.
3. **Per-user session isolation** — Each authenticated user gets their own Google OAuth token; tokens are never shared across sessions.
4. **Google Drive API calls** — All Drive operations are executed server-side using the `googleapis` SDK with the user's access token.

#### OAuth Flow Detail

```
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
       │◄── auth_callback ──────│                          │
       │    (https://claude.ai/api/mcp/auth_callback)      │
       │                        │                          │
       │── MCP tool calls ─────►│── Drive API calls ──────►│
       │◄── tool results ────────│◄── responses ────────────│
```

**Claude's OAuth callback URL:** `https://claude.ai/api/mcp/auth_callback`

---

### 3.3 MCP Tool Set

The server exposes these tools (a superset of Google's official 7-tool set, with improvements):

| Tool | Description | Drive API |
|------|-------------|-----------|
| `search_files` | Full-text and metadata search across Drive | `files.list` with `q` param |
| `read_file_content` | Read Docs, Sheets, Slides, plain text, PDFs | `files.export` / `files.get` |
| `download_file_content` | Download binary file content | `files.get` with `alt=media` |
| `get_file_metadata` | Get name, type, owner, modified date, size | `files.get` with `fields` |
| `get_file_permissions` | List sharing permissions | `permissions.list` |
| `create_file` | Create Google Docs / Sheets / Slides / folders | `files.create` |
| `update_file` | Update file content or metadata | `files.update` |
| `move_file` | Move file to a different folder | `files.update` (addParents/removeParents) |
| `share_file` | Add/remove permissions | `permissions.create` / `permissions.delete` |
| `list_folder` | List folder contents with pagination | `files.list` with parent filter |

---

## 4. Deployment Architecture

### Option A — Cloud Run (recommended)

```
GitHub repo → Cloud Build → Cloud Run (auto-scaling, HTTPS, managed certs)
                               │
                           Secret Manager
                           (OAuth client secret, session secret)
```

- Stateless; session tokens stored in Redis or encrypted cookies.
- Auto-scales to zero; cost-effective for personal/team use.

### Option B — Cloudflare Workers

- Built-in Durable Objects for session state.
- Global edge deployment; low latency worldwide.
- Cloudflare's `workers-oauth-provider` library simplifies the OAuth layer.

### Option C — VPS / Docker

```
nginx (TLS termination) → Node.js container → Google Drive API
                               │
                           Redis (session store)
```

---

## 5. Security Model

- **Least-privilege scopes** — request only `drive.file` (per-file access) by default; escalate to `drive.readonly` only if the user enables broader search.
- **Per-user token isolation** — access tokens are never stored in a shared location; each session resolves to one Google account.
- **Token encryption at rest** — refresh tokens encrypted with AES-256 before persisting.
- **PKCE** — used in the OAuth authorization code flow to prevent code interception.
- **Anthropic IP allowlist** — optionally restrict inbound MCP connections to [Anthropic's published IP ranges](https://docs.anthropic.com/en/api/ip-addresses).
- **No credential logging** — access tokens and refresh tokens are never written to application logs.

---

## 6. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Streamable HTTP over SSE | SSE transport is being deprecated by Anthropic; Streamable HTTP is the forward-compatible choice |
| Self-hosted over Google's official server | Google's server has confirmed tool-loading failures with Claude/Cowork; full control over the tool registry is the only reliable fix |
| TypeScript MCP SDK | Official SDK; best-maintained; type-safe tool registration |
| `googleapis` Node SDK | Google's official client; handles token refresh, retry logic, and quota management automatically |
| Per-user OAuth (not service account) | Users retain their own Drive permissions; no risk of one user accessing another's files |
| Plugin packaging | Single-click install in Cowork; distributable as a `.zip` or GitHub marketplace entry |
