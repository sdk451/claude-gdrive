# Runbook: `cloud_run_5xx`

## Trigger

**5xx rate > 1%** over 10 minutes on the Cloud Run service (`docs/observability.md`).

## First checks

1. **Cloud Run metrics** — instance count, CPU, memory, request concurrency.
2. **Logs** — stack traces, OOM, uncaught exceptions; confirm no token material in log lines.
3. **Dependencies** — Memorystore / VPC connector reachability if session errors correlate.

## Likely causes

- Bad deploy (throw on boot path).
- Upstream Google or Redis outage.
- Traffic spike exceeding concurrency limits.

## Mitigation

- Scale min instances or concurrency if sustained load.
- Roll back to previous digest; open incident if Google-wide.

## Rollback

Promote prior known-good image digest per `docs/environments.md`.
