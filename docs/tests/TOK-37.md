# TOK-37 — Test plan: S4.1 plugin bundle (P-01, P-02)

## Cases

1. **plugin.json exists and parses** — path `.claude-plugin/plugin.json`; required string fields present (`id`, `name`, `description`, `version`, `author`).
2. **.mcp.json exists and parses** — path `.mcp.json`; `mcpServers.gdrive` is an object with `type === "http"` and non-empty `url` string ending with `/mcp` (placeholder host allowed).
3. **No duplicate server keys** — `mcpServers` has exactly the `gdrive` entry expected for this connector (single remote server stub).

## Non-goals

- ZIP or Cowork UI automation (P-05 manual).
- JSON Schema formal validation against Anthropic’s unpublished schema beyond the field checks above.
