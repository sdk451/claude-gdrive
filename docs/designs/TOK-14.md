# TOK-14 — S0.9 Production deploy gate

## Goal

Replace the `release.yml` placeholder with a **tag-driven** workflow that promotes the **same image digest** already pushed for the tagged commit (`:${GITHUB_SHA}` from `ci.yml`) to **production** Cloud Run, then runs **prod smoke** checks.

## Constraints

- No JSON deploy keys in the repo; reuse **WIF** + `GCP_*` / `CLOUD_RUN_*` secrets pattern from `ci.yml`.
- If GCP secrets are **missing**, the workflow **exits green** with an explicit skip message (same ergonomics as optional Artifact Registry push).
- Image promotion is **digest-based** after resolving the digest for `GCP_ARTIFACT_REGISTRY:${GITHUB_SHA}`.

## Implementation outline

1. **`release.yml`**
   - `on.push.tags`: `v*.*.*` (covers `v0.1.0-rc1` style pre-releases).
   - Job `promote_prod`: gate → auth → gcloud → Docker login → `docker pull` + `docker inspect` for `RepoDigests[0]` → `gcloud run deploy` to prod service → smoke `curl` `/healthz`, `/.well-known/oauth-authorization-server`, `/__smoke/mcp-tools-list`.

2. **`src/server.ts`**
   - Add `GET /__smoke/mcp-tools-list`: minimal JSON shaped like an MCP `tools/list` result for release probes (not a full MCP transport).

3. **Docs**
   - `README.md`: prod release trigger + optional `CLOUD_RUN_SERVICE_PROD` secret; **single-command rollback** line using `gcloud run services update-traffic … --to-revisions=…=100`.
   - `docs/environments.md`: align `release.yml` row with tag trigger + prod smoke.

4. **Tests**
   - Unit test reads `release.yml` + README for required strings.
   - Unit test hits `createApp()` for the smoke route.

## Acceptance mapping

| AC                                             | How we satisfy                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Tag `v0.1.0-rc1` → green prod revision         | Workflow runs on tag push; deploy uses digest of `:sha` image when secrets exist. |
| Prod smoke: healthz, oauth AS, tools/list stub | Three `curl` steps + `__smoke` route.                                             |
| Single-command rollback documented + tested    | README template + unit assertion.                                                 |
