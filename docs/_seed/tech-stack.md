# Tech Stack: Google Drive Cowork Connector

---

## 1. Runtime & Language

| Choice | Version | Reason |
|--------|---------|--------|
| **Node.js** | 22 LTS | Official MCP TypeScript SDK targets Node; wide ecosystem for Google APIs; native fetch |
| **TypeScript** | 5.x | Type safety for MCP tool schemas and Google Drive API responses |
| **ESM modules** | — | Required by `@modelcontextprotocol/sdk` |

---

## 2. MCP Layer

### Core SDK

```
@modelcontextprotocol/sdk   (latest)
```

- Official Anthropic/MCP Foundation TypeScript SDK.
- Provides `McpServer`, `StreamableHTTPServerTransport`, tool registration, session lifecycle, and the full protocol state machine.
- The transport layer handles `POST /mcp`, `GET /mcp` (SSE streaming for compatibility), and `DELETE /mcp` automatically.

### Auth Spec

The server implements the **MCP Authorization 2025-03-26 spec**, which Claude supports:

- **Dynamic Client Registration (DCR)** — Claude auto-registers itself as an OAuth client on first connection; no manual client setup required on Claude's side.
- **PKCE (RFC 7636)** — Proof Key for Code Exchange, required for public OAuth clients.
- **Token refresh** — The server issues short-lived access tokens and handles Google OAuth refresh token exchange transparently.

---

## 3. HTTP Server

| Library | Role |
|---------|------|
| **Hono** | Lightweight, edge-compatible HTTP framework; works on Node, Cloudflare Workers, and Cloud Run without code changes |
| **`@hono/node-server`** | Node.js adapter for Hono |

Hono is preferred over Express for this use case because it runs identically on both Node (Cloud Run) and Cloudflare Workers (Option B deployment), giving deployment flexibility.

---

## 4. Google Drive Integration

| Library | Version | Role |
|---------|---------|------|
| **`googleapis`** | latest | Google's official Node.js SDK — Drive v3, Docs, Sheets, Slides APIs |
| **`google-auth-library`** | latest | OAuth2Client, token management, automatic refresh |

### Google Drive API v3 Endpoints Used

| Operation | Endpoint |
|-----------|----------|
| Search files | `GET /drive/v3/files?q={query}` |
| Get metadata | `GET /drive/v3/files/{fileId}?fields=...` |
| Read content (native) | `GET /drive/v3/files/{fileId}/export?mimeType=text/plain` |
| Read content (binary) | `GET /drive/v3/files/{fileId}?alt=media` |
| Get permissions | `GET /drive/v3/files/{fileId}/permissions` |
| Create file | `POST /drive/v3/files` + multipart body |
| Update file | `PATCH /drive/v3/files/{fileId}` |
| Manage permissions | `POST /drive/v3/files/{fileId}/permissions` |

### OAuth Scopes (Least-Privilege)

| Scope | Usage | Sensitivity |
|-------|-------|-------------|
| `https://www.googleapis.com/auth/drive.file` | Per-file access (files created/opened by the app) | Non-sensitive |
| `https://www.googleapis.com/auth/drive.readonly` | Read-only access to all files (for search) | Sensitive |
| `https://www.googleapis.com/auth/drive` | Full read/write (optional, for share/move) | Restricted |
| `https://www.googleapis.com/auth/documents` | Google Docs read/write | Sensitive |
| `https://www.googleapis.com/auth/spreadsheets` | Google Sheets read/write | Sensitive |

Default configuration requests `drive.file` + `drive.readonly`. Additional scopes are unlocked via server environment configuration. Restricted scopes (`drive`) require Google's OAuth verification for production public apps.

---

## 5. Session & Token Storage

| Option | Technology | Use Case |
|--------|-----------|----------|
| **Development / single-user** | In-memory Map | Fast, zero-config |
| **Team / production (Cloud Run)** | **Redis** via `ioredis` | Durable, survives restarts, TTL support |
| **Cloudflare Workers** | **Durable Objects** | Edge-native, strongly consistent |

Refresh tokens are encrypted with **AES-256-GCM** (Node `crypto` module) before storage. The encryption key is loaded from an environment variable / secret manager — never hardcoded.

---

## 6. Deployment Infrastructure

### Option A — Google Cloud Run (Recommended for most users)

| Component | Service |
|-----------|---------|
| Container registry | Artifact Registry |
| Runtime | Cloud Run (managed, auto-scaling) |
| Secrets | Secret Manager (OAuth client secret, session key) |
| TLS | Managed automatically by Cloud Run |
| Domain | Cloud Run URL or custom domain with Cloud Load Balancer |
| Redis | Cloud Memorystore (Redis) or Upstash Redis |

**Why Cloud Run:** Serverless, scales to zero, HTTPS out of the box, and easily connects to Google's own APIs with Workload Identity if needed.

### Option B — Cloudflare Workers

| Component | Service |
|-----------|---------|
| Runtime | Cloudflare Workers |
| State | Durable Objects |
| Secrets | Workers Secrets |
| OAuth helpers | `workers-oauth-provider` (Cloudflare's library) |
| Domain | `*.workers.dev` or custom domain |

### Option C — VPS / Docker Compose

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

  nginx:
    image: nginx:alpine
    # TLS termination, reverse proxy to :3000
```

---

## 7. Cowork Plugin Format

The plugin wrapper is **pure JSON and Markdown** — no build step required.

| File | Format | Purpose |
|------|--------|---------|
| `.claude-plugin/plugin.json` | JSON | Plugin manifest (id, name, version, description) |
| `.mcp.json` | JSON | MCP server URL + OAuth client credentials |
| `skills/*.md` | Markdown | Domain knowledge auto-injected into context |
| `commands/*.md` | Markdown | Slash command definitions (`/gdrive:search`, etc.) |
| `README.md` | Markdown | Installation guide |

Distribution: packaged as a `.zip` and uploaded via Cowork's plugin installer, or published to a GitHub-based plugin marketplace using `claude plugin marketplace add`.

---

## 8. Development Tooling

| Tool | Purpose |
|------|---------|
| **MCP Inspector** | Test and validate the MCP server locally before deploying (`npx @modelcontextprotocol/inspector`) |
| **Cloudflare AI Playground** | Alternative remote MCP testing without a Claude account |
| **ngrok / Cloudflare Tunnel** | Expose local dev server to Anthropic's cloud for integration testing |
| **Vitest** | Unit tests for tool handlers and OAuth middleware |
| **Docker** | Local parity with production environment |
| **ESLint + Prettier** | Code quality and formatting |
| **Husky** | Pre-commit hooks |

---

## 9. CI / CD

```
GitHub Actions
  ├── on: push to main
  ├── run: npm test (Vitest)
  ├── run: docker build
  └── deploy: gcloud run deploy  (or wrangler deploy for Cloudflare)
```

---

## 10. Monitoring & Observability

| Layer | Tool |
|-------|------|
| Structured logging | `pino` (JSON logs, compatible with Cloud Logging / Datadog) |
| Error tracking | Sentry (optional) |
| Metrics | Cloud Run built-in metrics (request count, latency, error rate) |
| OAuth audit | Log every `authorize` and `token` exchange event (without logging the token values) |
