---
title: Local development — Node vs Docker
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## Purpose

Run the **self-hosted MCP server** on your machine to test OAuth, **`POST /mcp`**, and **`tools/list`**. This document covers two ways to do that:

| Approach              | When to use                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Node (`pnpm dev`)** | Fastest iteration: TypeScript on disk, `tsx` reload on save, no image rebuild.                             |
| **Docker**            | Closest to **Cloud Run** / CI: same **production** image the `Dockerfile` builds, default **`PORT=8080`**. |

The variable names and boot validation are the same in both cases (see [`env.example`](../env.example) and [`src/config/env.ts`](../src/config/env.ts)). The runtime **does not** load a `.env` file automatically; export variables in the shell, use your IDE run configuration, or pass `-e` / `--env-file` to Docker. ([`docs/designs/TOK-6.md`](./designs/TOK-6.md) explains why there is no bundled `dotenv` in the server.)

Broader operator context: [README — Operator guide](../README.md#operator-guide--server-setup--cowork-install) and [environments](environments.md).

## Prerequisites (both options)

- **Node.js 22** and **pnpm** (see [`package.json`](../package.json) `engines` / `packageManager`).
- A **Google Cloud OAuth 2.0** “Web application” client with the **Google Drive API** enabled. Under **Authorized redirect URIs**, include at least **`https://claude.ai/api/mcp/auth_callback`** for hosted Cowork, plus any **loopback** URIs you need for local browser OAuth (see [`ux.md`](ux.md)).
- A **`SESSION_SECRET`**: 32 bytes as 64 hex characters:

  ```bash
  openssl rand -hex 32
  ```

## Option A — Node (recommended for day-to-day dev)

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Set required environment** (no trailing path on `PUBLIC_ISSUER_URL` — it is an **origin** only):

   | Variable               | Notes                                                                                                                                                                                                                  |
   | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `GOOGLE_CLIENT_ID`     | From Google Cloud Console.                                                                                                                                                                                             |
   | `GOOGLE_CLIENT_SECRET` | Same OAuth client.                                                                                                                                                                                                     |
   | `SESSION_SECRET`       | Exactly **64** hex characters from `openssl rand -hex 32`.                                                                                                                                                             |
   | `PORT`                 | Optional. If unset, the process defaults to **3000** (see `src/index.ts`).                                                                                                                                             |
   | `PUBLIC_ISSUER_URL`    | Optional. If unset, the issuer is **`http://127.0.0.1:${PORT}`** with `PORT` defaulting to **`3000`** in [`parseBootEnv`](../src/config/env.ts) when `PORT` is empty — align this with the URL you use in the browser. |

3. **Start the dev server** (watches and restarts on file changes):

   ```bash
   pnpm dev
   ```

4. **Smoke HTTP** (adjust port if you overrode `PORT`):

   ```bash
   curl -fsS http://127.0.0.1:3000/healthz
   curl -fsS http://127.0.0.1:3000/.well-known/oauth-authorization-server
   ```

5. **MCP `tools/list`** — the [Inspector script](../scripts/mcp-inspector-validate.sh) defaults to **`http://127.0.0.1:8080/mcp`**, which matches Docker, not the default Node port. For default **`pnpm dev`** on port **3000**, set:

   ```bash
   export MCP_INSPECTOR_URL=http://127.0.0.1:3000/mcp
   pnpm inspector:validate
   ```

   On Windows (PowerShell): `$env:MCP_INSPECTOR_URL = "http://127.0.0.1:3000/mcp"; pnpm inspector:validate`

6. **Production-like run without Docker** (built JS):

   ```bash
   pnpm build
   pnpm start
   ```

   `pnpm start` runs `node dist/index.js` with the same env contract as the container.

**Tip:** If you want one command line with Node to match the Inspector default **`8080`**, set `PORT=8080` (and matching `PUBLIC_ISSUER_URL` if you set it explicitly).

## Option B — Docker (prod-parity image)

1. **Build** from the repository root:

   ```bash
   docker build -t gdrive-mcp:local .
   ```

2. The **runtime image** sets **`ENV PORT=8080`** and exposes **8080** (see [`Dockerfile`](../Dockerfile)). It runs **`node dist/index.js`** as a non-root user.

3. **Run** with the same three required secrets plus an issuer that matches how you open the app in a browser. Example (bash):

   ```bash
   docker run --rm -p 8080:8080 \
     -e PORT=8080 \
     -e PUBLIC_ISSUER_URL=http://127.0.0.1:8080 \
     -e GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com \
     -e GOOGLE_CLIENT_SECRET=your-secret \
     -e SESSION_SECRET="$(openssl rand -hex 32)" \
     gdrive-mcp:local
   ```

   For PowerShell, pass secrets with `-e` or use `--env-file` pointing at a file that is **not** committed.

4. **Smoke**

   ```bash
   curl -fsS http://127.0.0.1:8080/healthz
   curl -fsS http://127.0.0.1:8080/.well-known/oauth-authorization-server
   ```

5. **Inspector** — default URL matches Docker:

   ```bash
   bash scripts/mcp-inspector-validate.sh
   # or: pnpm inspector:validate
   ```

6. **Clients** (e.g. **`.mcp.json`**) should use **`http://127.0.0.1:8080/mcp`** for Streamable HTTP MCP on this port map.

**HTTPS / tunnel:** If you need a **public HTTPS** origin (hosted Cowork, Google redirects), use a tunnel (ngrok, Cloudflare Tunnel, etc.), set **`PUBLIC_ISSUER_URL`** to that **HTTPS** origin, and register the matching redirect URIs in Google Cloud. See [README](../README.md) and [environments](environments.md) (`dev` row).

## Quick reference

|                                           | Node (default)                 | Docker image                          |
| ----------------------------------------- | ------------------------------ | ------------------------------------- |
| **Listen port**                           | `3000` if `PORT` unset         | `8080` in image `ENV`                 |
| **MCP path**                              | `/mcp`                         | `/mcp`                                |
| **Inspector `MCP_INSPECTOR_URL` default** | **Override** to `...:3000/mcp` | `http://127.0.0.1:8080/mcp` (default) |
| **Reload on save**                        | Yes (`tsx watch`)              | Rebuild / rerun container             |

## Related

- [Architecture — HTTP & OAuth](architecture.md)
- [UX — OAuth surfaces](ux.md)
- [Runbooks & MCP Inspector](../README.md#runbooks--mcp-inspector-s54) — `scripts/mcp-inspector-validate.sh`
