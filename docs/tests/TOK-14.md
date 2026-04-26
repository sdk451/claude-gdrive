# TOK-14 — Test plan (S0.9 production deploy gate)

## Behaviours under test

1. **Release workflow**
   - Triggers on SemVer-style tags (`v*.*.*`).
   - Contains gated GCP auth, digest resolution path, `gcloud run deploy` for prod, and three smoke URLs.

2. **Smoke route**
   - `GET /__smoke/mcp-tools-list` returns 200 JSON including a non-empty `tools` array (MCP-shaped stub).

3. **Rollback operator contract**
   - README documents a single `gcloud run services update-traffic` command template with `--to-revisions=…=100`.

## Validation

- Vitest: `tests/unit/release-workflow-baseline.test.ts`
- Vitest: `tests/unit/server-smoke-tools-list.test.ts`

## Targets file

`docs/tests/TOK-14-targets.txt` (alias: `docs/tests/S0.9-targets.txt`).
