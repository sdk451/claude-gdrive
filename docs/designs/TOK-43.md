# TOK-43 — Design: S5.4 Docs and runbooks complete

## Goal

Close **S5.4**: operators have a **complete on-call trail** from **`docs/observability.md`** alerts → **`docs/runbooks/`** pages, the **README** ties together the operator guide + runbooks + **MCP Inspector** validation, and a **committed script** runs Inspector in **CLI** mode against a running Streamable HTTP MCP URL.

## Deliverables

1. **Runbooks** — One markdown file per alert in `docs/observability.md` § Alerting (initial set): `tools.list.empty` (existing), `oauth.refresh_failure`, `cloud_run_5xx`, `latency_p95_high`, `dependency_high_severity`, `secret_in_log`. Each follows: trigger → first checks → likely causes → mitigation → rollback.
2. **Runbook index** — `docs/runbooks/README.md` table: alert id → path → severity.
3. **Observability doc** — Alerting table gains a **Runbook** column linking the files above.
4. **README** — Explicit pointer to the operator guide pair (**README** + **`docs/environments.md`**) and links to **`docs/runbooks/README.md`** + **`scripts/mcp-inspector-validate.sh`**.
5. **MCP Inspector script** — `scripts/mcp-inspector-validate.sh`: `npx @modelcontextprotocol/inspector@latest <url> --cli --transport http --method tools/list` with `MCP_INSPECTOR_URL` override (default `http://127.0.0.1:8080/mcp`).

## Non-goals

- Running Inspector inside default PR CI (needs live server + `npx`); the script is the **operator / release gate**.
