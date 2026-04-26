# TOK-43 — Test plan: S5.4 Docs and runbooks complete

## Scope

Contract-style checks that **runbook files** exist for every alert in **`docs/observability.md` § Alerting**, the **README** links the **runbook index** and **Inspector script**, and **`scripts/mcp-inspector-validate.sh`** contains the expected **CLI** invocation.

## Cases

1. **Runbook files** — All six alert runbooks exist under `docs/runbooks/`.
2. **README** — References `docs/runbooks/README.md` and `scripts/mcp-inspector-validate.sh` (or equivalent MCP Inspector validation wording).
3. **Inspector script** — File exists and includes `--cli`, `--transport http`, `--method tools/list`, and `@modelcontextprotocol/inspector`.

## Targets

- `docs/tests/TOK-43-targets.txt`
- `docs/tests/S5.4-targets.txt` (alias)
