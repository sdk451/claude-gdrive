---
title: Tech Stack — Google Drive Cowork Connector
project: gdrive-cowork-connector
date: 2026-04
status: draft
---

## Runtime & language

- **Node.js**: 22 LTS (deployment constraint NF-07).
- **TypeScript**: 5.x.
- **Modules**: ESM (required by `@modelcontextprotocol/sdk`).

## MCP layer

- **SDK**: `@modelcontextprotocol/sdk` (TypeScript).
- **Transport**: Streamable HTTP first; optionally legacy HTTP+SSE for compatibility (Claude notes SSE is being deprecated: [Building custom connectors](https://claude.com/docs/connectors/building/index.md)).
- **Tools**: must define `name`, (recommended) `title`, `description`, and `inputSchema`; clients discover via `tools/list` and call via `tools/call` (spec: [Tools](https://modelcontextprotocol.io/specification/latest/server/tools)).
- **Tool annotations**: set `readOnlyHint` / `destructiveHint` appropriately ([MCP overview](https://claude.com/docs/connectors/building/mcp.md); directory checklist: [Pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria.md)).

## Authentication & authorization

- **OAuth type**: start with `oauth_dcr` (DCR) or `oauth_cimd` (Client ID Metadata Documents), both supported by Claude ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)).
- **Callback URLs**:
  - Hosted Claude surfaces: `https://claude.ai/api/mcp/auth_callback` ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)).
  - Claude Code: loopback redirects declared in the client metadata ([Claude Code client metadata](https://claude.ai/oauth/claude-code-client-metadata)).
- **Token refresh**: rely on refresh tokens; avoid leaking tokens in logs; handle rotation correctly (Claude refresh behavior described in [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)).
- **Optional**: consider “lazy auth” (mixed public + protected tools) if you want tools/list and some read-only functionality to work before login ([Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md)).

## HTTP server

- **Framework**: **Hono** (+ `@hono/node-server`) for a lightweight, deploy-flexible routing layer (Node + Workers).

## Google Drive integration

- **Google SDK**: `googleapis` + `google-auth-library`.
- **API**: Drive API v3 (primary endpoints: `files.*`, `permissions.*`).
  - File metadata + content: [Files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
  - Sharing: [Permissions resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions) and [Roles and permissions](https://developers.google.com/workspace/drive/api/guides/ref-roles)
- **Scopes**: default to the narrowest scopes possible and clearly document step-up to broader scopes. Google scope categories and verification implications: [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

### Drive API endpoints used (illustrative)

| Operation                   | Endpoint                                                  |
| --------------------------- | --------------------------------------------------------- |
| Search files                | `GET /drive/v3/files?q={query}`                           |
| Get metadata                | `GET /drive/v3/files/{fileId}?fields=...`                 |
| Read content (Docs Editors) | `GET /drive/v3/files/{fileId}/export?mimeType=text/plain` |
| Download binary             | `GET /drive/v3/files/{fileId}?alt=media`                  |
| Get permissions             | `GET /drive/v3/files/{fileId}/permissions`                |
| Create file                 | `POST /drive/v3/files` (+ multipart upload when needed)   |
| Update file                 | `PATCH /drive/v3/files/{fileId}`                          |
| Manage permissions          | `POST /drive/v3/files/{fileId}/permissions`               |

### OAuth scope posture (recommended)

Use the narrowest scopes possible and be explicit about when broader scopes are required (and their verification implications).

| Scope                                            | Typical usage                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `https://www.googleapis.com/auth/drive.file`     | Create/modify files the user explicitly opens/shares with the app |
| `https://www.googleapis.com/auth/drive.readonly` | Search/read across all files (restricted scope)                   |
| `https://www.googleapis.com/auth/drive`          | Full read/write (restricted; only if you truly need it)           |

## Session & token storage

Storage options (production needs durability + TTL):

- **Redis** (Cloud Run / VPS): `ioredis`
- **Durable Objects** (Workers)
- **Dev**: in-memory map

Security requirements:

- Encrypt refresh tokens at rest (NF-03).
- Never log credentials or tokens (NF-04).

## Deployment infrastructure

Supported deployment shapes (match the architecture doc’s options):

- **Cloud Run**: Artifact Registry, Cloud Run, Secret Manager, optional Memorystore/Upstash Redis.
- **Cloudflare Workers**: Workers + Durable Objects + Workers Secrets.
- **VPS/Docker**: container + Redis + reverse proxy for TLS.

Example Docker Compose shape (VPS path):

```yaml
services:
  mcp-server:
    image: ghcr.io/yourorg/gdrive-mcp:latest
    environment:
      - GOOGLE_CLIENT_ID
      - GOOGLE_CLIENT_SECRET
      - SESSION_SECRET
      - REDIS_URL
    ports:
      - "3000:3000"

  redis:
    image: redis:7-alpine
```

## Observability

- **Structured logs**: `pino` JSON logs (NF-08).
- **Error tracking**: Sentry (optional).
- **Correlation IDs**: request id + hashed session/user id + tool name per log line.

## Testing tooling

- **MCP Inspector**: validate protocol compliance, tool schemas, and auth flows ([MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)).
- **Claude custom connector testing**: test against real Claude runtime (no staging) ([Testing your connector](https://claude.com/docs/connectors/building/testing.md)).
- **Unit tests**: Vitest.
- **Integration tests**: tunnel dev server (ngrok / Cloudflare Tunnel) and test as custom connector.
- **Local parity**: Docker for local prod-like runs.
- **Code quality**: ESLint + Prettier (and optionally Husky for pre-commit).

## CI/CD

- **CI**: GitHub Actions
  - Lint + typecheck + unit tests
  - Build container
- **CD**:
  - Cloud Run: `gcloud run deploy`
  - Workers: `wrangler deploy`

## Plugin packaging (wrapper)

The plugin wrapper is file-based JSON + Markdown (skills/commands) that references the remote MCP server URL. See:

- [Plugins overview](https://claude.com/docs/plugins/overview.md)
- [What should I build: MCP, plugin, or both?](https://claude.com/docs/connectors/building/what-to-build.md)
