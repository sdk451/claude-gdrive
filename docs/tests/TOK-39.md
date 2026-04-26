# TOK-39 — Test plan: S4.3 operator README (P-07)

## Cases

1. **Stable heading** — `README.md` contains `## Operator guide` (contract anchor).
2. **Cloud Run + secrets** — body mentions **Cloud Run**, **Secret Manager**, and links to **`docs/environments.md`** (relative `](docs/environments.md` or with fragment).
3. **OAuth** — body mentions **`https://claude.ai/api/mcp/auth_callback`** and **`GOOGLE_CLIENT_ID`** (or both split across lines).
4. **Plugin / MCP URL** — body mentions **`.mcp.json`** and **`/mcp`** so operators know what to edit after deploy.

## Out of scope

- Spell-check / prose lint beyond the anchors above.
