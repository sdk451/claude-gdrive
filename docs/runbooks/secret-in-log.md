# Runbook: `secret_in_log`

## Trigger

**Secret-in-log canary** matched a log line (e.g. Google access-token prefix `ya29.` or refresh-token pattern `1//`) — **page** severity; treat as incident (`docs/observability.md`).

## First checks

1. **Identify the log entry** — timestamp, `request_id`, `session_id_hash`; **do not** paste token material into tickets.
2. **Code path** — which route logged raw `Authorization`, query string, or JSON body field missed by redaction?
3. **Blast radius** — staging vs prod; retention window for the leaked line.

## Likely causes

- New log statement without redaction paths in `src/observability/redaction.ts`.
- Third-party middleware logging headers.

## Mitigation

- **Rotate** affected OAuth client secret or user refresh material per incident response policy.
- Patch redaction + add regression test; redeploy immediately.

## Rollback

Rollback does not erase logs; focus on rotation + fix-forward deploy.
