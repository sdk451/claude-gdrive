# On-call runbooks (alert → playbook)

Each row maps an alert from [`docs/observability.md`](../observability.md#alerting-initial-set) to a short operator playbook under this directory.

| Alert id                   | Severity | Runbook                                                            |
| -------------------------- | -------- | ------------------------------------------------------------------ |
| `tools.list.empty`         | page     | [tools-list-empty.md](tools-list-empty.md)                         |
| `oauth.refresh_failure`    | page     | [oauth-refresh-failure.md](oauth-refresh-failure.md)               |
| `cloud_run_5xx`            | page     | [cloud-run-5xx.md](cloud-run-5xx.md)                               |
| `latency_p95_high`         | warn     | [latency-p95-high.md](latency-p95-high.md)                         |
| `dependency_high_severity` | warn     | [dependency-high-severity-cve.md](dependency-high-severity-cve.md) |
| `secret_in_log`            | page     | [secret-in-log.md](secret-in-log.md)                               |

**MCP Inspector** (connector smoke, not an alert): [`scripts/mcp-inspector-validate.sh`](../../scripts/mcp-inspector-validate.sh) — run against a live `/mcp` URL after `pnpm dev` or staging deploy.
