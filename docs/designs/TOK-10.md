---
story: TOK-10
title: S0.5 — Staging deploy from main
persona: Plan
status: approved
date: 2026-04-26
sources:
  - docs/environments.md
  - docs/backlog.md
  - .github/workflows/ci.yml
---

# Design: Staging deploy from `main`

## Goal

On every push to `main`, if deploy credentials are configured, deploy the
already-built container image to **Cloud Run staging** using **image digest**
semantics (no rebuild between build and deploy). After deploy, run a small
smoke suite against the staging URL:

- `GET /healthz` → 200
- `GET /.well-known/oauth-authorization-server` → 200

## Scope

In:

1. **`ci.yml` deploy job** (after regression, after image push):
   - Authenticate via GitHub OIDC Workload Identity Federation
   - Deploy to Cloud Run service `gdrive-mcp-staging` (configurable)
   - Use **image digest** returned by the push step
   - Smoke test with `curl` against the deployed service URL
2. **Minimal discovery endpoint**:
   - Add `/.well-known/oauth-authorization-server` route returning a valid JSON
     stub for now (real metadata will be expanded in Epic 1 S1.3).
3. **Rollback docs**:
   - Document `gcloud run services update-traffic` rollback to previous revision.
4. **Targets + tests**:
   - `docs/tests/TOK-10-targets.txt` + `docs/tests/S0.5-targets.txt`
   - Unit tests verifying `ci.yml` contains deploy/smoke wiring and server route exists.

Out:

- Full production promotion and tagged release flow (S0.9 / release train).
- Full OAuth metadata completeness (Epic 1 S1.3 will own the full spec).

## Secrets / configuration (CI)

Deploy steps run only when all are present:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `GCP_ARTIFACT_REGISTRY` (repository path without tag)
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE_STAGING` (default `gdrive-mcp-staging`)
