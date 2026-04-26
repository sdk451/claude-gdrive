# TOK-41 — Test plan: S5.2 Latency budget enforcement

## Scope

NF-02 latency budget: **p95 MCP `tools/call` (search_files) ≤ 3000 ms** under **high concurrent load** with a **stubbed Drive** port (integration). Dashboard JSON schema sanity (unit). Staging **100 RPS** validation is **operator-owned** via `scripts/synthetic-mcp-latency.mjs` (documented in `infra/observability/README.md` and `README.md`).

## Cases

1. **Integration** — Many concurrent `tools/call` `search_files` requests through `createApp({ driveFiles })` where `listFiles` adds small random delay; collect client RTTs; **p95 < 3000 ms**.
2. **Unit** — `latency-dashboard.json` parses as JSON and declares expected `displayName` / `gridLayout` for drift detection.

## Targets

- `docs/tests/TOK-41-targets.txt` (CI story file)
- `docs/tests/S5.2-targets.txt` (backlog alias; same lines)
