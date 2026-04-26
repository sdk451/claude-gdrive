---
title: Observability — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## Goals

1. Every MCP request and Google Drive API call is observable end-to-end via structured logs (NF-08).
2. Operators can answer "did this user's tool call succeed, why or why not, and how long did it take?" within one minute of being asked.
3. No credential or token material ever appears in logs (NF-04).

## Structured logging

- **Library:** `pino` (JSON to stdout). Cloud Run captures stdout into Cloud Logging.
- **Required fields on every log line:**

| Field             | Type            | Notes                                                    |
| ----------------- | --------------- | -------------------------------------------------------- |
| `ts`              | ISO 8601 string | from `pino`                                              |
| `level`           | string          | `debug`/`info`/`warn`/`error`                            |
| `msg`             | string          | human-readable                                           |
| `request_id`      | string          | uuidv4 generated at MCP HTTP entry                       |
| `session_id_hash` | string          | SHA-256 of `mcp-session-id`, truncated to 16 hex chars   |
| `user_id_hash`    | string          | SHA-256 of Google `sub` claim, truncated to 16 hex chars |
| `tool`            | string          | MCP tool name when applicable                            |
| `outcome`         | string          | `success` / `error` / `retry` / `auth_required`          |
| `latency_ms`      | number          | request duration when applicable                         |
| `drive_endpoint`  | string          | e.g. `files.list` when applicable                        |

- **Redaction:** `pino` configured with redaction paths covering `req.headers.authorization`, `req.headers.cookie`, `body.access_token`, `body.refresh_token`, `body.code`, `body.id_token`. Redacted fields render as `"[redacted]"`. The redaction list is reviewed in every PR that touches OAuth code.
- **Forbidden:** logging file contents, file ids unless provided in the request, full Drive query strings (log a hashed query digest instead), or any value of `Authorization` headers.

## Error tracking

- **Service:** Sentry (optional but recommended). Configured via `SENTRY_DSN`.
- **Sampled:** 100% of errors and warnings; performance traces sampled at 10% in prod, 100% in staging.
- **Scrubbing:** Sentry's default PII scrubbing plus a custom `beforeSend` hook that drops any event whose payload matches the redaction list above.

### Readiness smoke (`GET /__smoke/sentry-test`)

After staging deploy, with `SENTRY_DSN` set on the service, call this route once. The handler returns JSON `{"status":"sent"}` when a one-shot `captureMessage` + `flush` ran; `{"status":"skipped","reason":"SENTRY_DSN not set"}` when the variable is absent (expected in local dev). The SDK is only loaded when the DSN is non-empty.

## Tracing

- Optional in v1; OpenTelemetry SDK left in place behind a feature flag (`OTEL_ENABLED=true`) so a future Epic can turn it on without surgery. When on, traces export to Cloud Trace via the OTLP exporter.

## Metrics

- Cloud Run native metrics cover request count, latency, instance count, error rate.
- Custom metrics (Cloud Monitoring custom metrics or Sentry):
  - `mcp_tool_call_total{tool,outcome}`
  - `drive_api_call_total{endpoint,status_class}`
  - `oauth_refresh_total{outcome}`
  - `tools_list_empty_total` — alarmable at non-zero; this is the failure mode we are explicitly defending against.

## Alerting (initial set)

| Alert                      | Condition                              | Severity |
| -------------------------- | -------------------------------------- | -------- |
| `tools.list.empty`         | any non-zero rate over 5 min           | page     |
| `oauth.refresh_failure`    | failure rate > 1% over 15 min          | page     |
| `cloud_run_5xx`            | 5xx rate > 1% over 10 min              | page     |
| `latency_p95_high`         | p95 > 3 s over 15 min                  | warn     |
| `dependency_high_severity` | new high/critical CVE in scan          | warn     |
| `secret_in_log`            | log entry matches token regex (canary) | page     |

A simple log-based "secret-in-log" canary regex (e.g., looking for `ya29\.` Google access-token prefix or `1//` refresh-token prefix in any log entry) runs as a Cloud Logging alerting policy. If it ever fires, treat as a hard incident.

## Dashboards

A single Cloud Monitoring dashboard tracks: request rate, p50/p95/p99 latency, 5xx rate, OAuth refresh success rate, top tools by call volume, top error messages (after redaction). The README documents how operators import it from the repo's `infra/observability/dashboard.json`.

## Operator runbooks

A short runbook lives at `docs/runbooks/` for each pageable alert (created during Epic 0). Each runbook follows: trigger → first check → likely causes → mitigation → rollback.

## Data retention

- Cloud Logging: 30 days default in v1; longer retention is an operator decision documented in the README.
- Sentry: default project retention.
- No long-term storage of request bodies or tool result payloads.
