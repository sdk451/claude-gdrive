# TOK-37 — Design: S4.1 `plugin.json` + `.mcp.json`

## Goal

Satisfy **P-01** and **P-02** (`docs/prd.md` §5.3): ship a **file-only** Cowork/Claude plugin manifest and MCP client stub so the repo can be zipped and installed per `docs/architecture.md` bundle layout.

## Layout

- **`.claude-plugin/plugin.json`** — plugin metadata (`id`, `name`, `description`, `version`, `author`) aligned with `package.json` name/description/version where applicable.
- **`.mcp.json`** (repo root) — `mcpServers.gdrive` with `type: "http"` and a **placeholder** `url` pointing at the Streamable HTTP MCP path (`…/mcp`). Deployers replace the host with their self-hosted server; OAuth continues to be negotiated via the server’s metadata (DCR / discovery), not hard-coded secrets in the bundle.

## Out of scope (this story)

- **P-03** skills, **P-04** commands, **P-07** README depth — separate stories; not required for TOK-37 title scope.
- Changing server runtime or OAuth implementation.

## Acceptance

- Both files exist, are valid JSON, and match the structural contract enforced by unit tests.
- `docs/tests/S4.1-targets.txt` (and `TOK-37-targets.txt`) list only the manifest tests.
