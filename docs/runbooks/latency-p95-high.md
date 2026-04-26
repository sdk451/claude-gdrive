# Runbook: `latency_p95_high`

## Trigger

**p95 latency > 3 s** over 15 minutes (warn severity; `docs/observability.md`).

## First checks

1. **Latency dashboard** — `infra/observability/latency-dashboard.json` (imported in Cloud Monitoring) for Cloud Run tail latency.
2. **Structured logs** — `latency_ms` on `/mcp` vs Drive adapter; isolate MCP-only vs Drive API slowness.
3. **Synthetic check** — `node scripts/synthetic-mcp-latency.mjs` against staging with `LOAD_TEST_BASE_URL`.

## Likely causes

- Cold start + burst; under-provisioned CPU.
- Drive API or network degradation.
- Inefficient tool path or accidental debug logging volume.

## Mitigation

- Increase CPU allocation / min instances.
- If Drive-bound, wait for Google status or reduce abusive traffic (rate limit at edge if applicable).

## Rollback

Not always required; if a deploy caused regression, roll back revision.
