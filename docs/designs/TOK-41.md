# TOK-41 — Design: S5.2 Latency budget enforcement (NF-02)

## Goal

Enforce **NF-02** / constitution latency commitments: **typical MCP `tools/call` round-trip (through Drive port) ≤ 3 s**, with **observable** tail latency on Cloud Run and a **repeatable synthetic load** path for staging.

## Deliverables

1. **Latency dashboard (repo)** — `infra/observability/latency-dashboard.json`: Cloud Monitoring **gridLayout** dashboard charting Cloud Run **`run.googleapis.com/request_latencies`** (p95) so operators correlate HTTP tail latency with the **3 s** budget. Import instructions in `infra/observability/README.md`.
2. **Synthetic load script** — `scripts/synthetic-mcp-latency.mjs` (Node 22, no extra deps): maintains **target RPS** (default **100**) for a wall-clock duration using **N parallel MCP sessions** (each session: `initialize` → loop `tools/call` `search_files` with fixed `q`). Computes **client-side p95** and exits **non-zero** if `p95 > 3000` ms. Env: `LOAD_TEST_BASE_URL`, `LOAD_TEST_RPS`, `LOAD_TEST_DURATION_SEC`, `LOAD_TEST_WORKERS` (optional).
3. **CI regression** — Integration test hammers `tools/call` `search_files` against `createApp({ driveFiles: stub })` with **stub latency + high concurrency**, asserts **p95 < 3000 ms**. This guards the **server + MCP + tool** path; staging still runs the script against real Cloud Run + Google.

## Non-goals

- Turning on OpenTelemetry or custom Cloud Monitoring write APIs in the app.
- Autop-run of the 100 RPS script inside default PR CI (too timing-flaky); the script is the **staging gate**; CI runs the bounded integration test.

## Acceptance mapping

| AC                             | Evidence                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| p95 ≤ 3 s @ 100 RPS on staging | Operators run `node scripts/synthetic-mcp-latency.mjs` with `LOAD_TEST_BASE_URL` pointing at staging; script enforces exit code. |
| Dashboard in repo              | `infra/observability/latency-dashboard.json` + README import steps.                                                              |
