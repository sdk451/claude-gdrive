# Cloud Monitoring dashboards (repo)

## Latency dashboard (S5.2 / NF-02)

File: **`latency-dashboard.json`**

Charts **Cloud Run revision** request latency (**`run.googleapis.com/request_latencies`**, p95 alignment) so you can correlate service tail latency with the **3 s** MCP tool round-trip budget (`docs/prd.md` NF-02, `docs/observability.md`).

### Import (Google Cloud Console)

1. Open **Monitoring → Dashboards → Create dashboard → Import dashboard**.
2. Paste the JSON from `latency-dashboard.json` or upload the file.
3. Pin a filter for **`service_name`** = your Cloud Run service if the chart is too noisy.

### Import (API)

```bash
ACCESS_TOKEN="$(gcloud auth print-access-token)"
curl -sS -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/dashboards" \
  -d @latency-dashboard.json
```

### Staging load gate (100 RPS)

From a machine that can reach staging:

```bash
export LOAD_TEST_BASE_URL="https://<your-staging-host>"
export LOAD_TEST_RPS=100
export LOAD_TEST_DURATION_SEC=120
node scripts/synthetic-mcp-latency.mjs
```

The script exits **1** if client-side **p95 > 3000 ms**. Tune `LOAD_TEST_WORKERS` (default: match RPS, capped) if the server rejects too many concurrent sessions.
