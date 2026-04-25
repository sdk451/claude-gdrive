---
title: Environments — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## Targets

| Env       | Purpose                                                     | URL pattern                                       | Region                  | Trigger                         |
| --------- | ----------------------------------------------------------- | ------------------------------------------------- | ----------------------- | ------------------------------- |
| `dev`     | Local development + ephemeral tunnel for connector testing  | `https://<ngrok-or-cf-tunnel>.ngrok-free.app/mcp` | local + tunnel          | every developer commit (manual) |
| `staging` | Shared prerelease, real Cloud Run with isolated GCP project | `https://gdrive-mcp-staging.<region>.run.app/mcp` | `us-central1` (default) | merge to `main`                 |
| `prod`    | Public, supported deployment                                | `https://gdrive-mcp.<region>.run.app/mcp`         | `us-central1` (default) | tagged release `vX.Y.Z`         |

The **default canonical deployment target is Cloud Run.** Cloudflare Workers and VPS/Docker are documented alternatives in `docs/architecture.md`; CI is built around Cloud Run first, with Workers and Docker compose covered as optional adjacent jobs.

## Infrastructure

- **Compute:** Cloud Run (managed, autoscaling 0–N). Container built on `node:22-bookworm-slim`, runs as non-root, listens on `$PORT`.
- **State / sessions:** Memorystore Redis (private VPC connector) for staging/prod. In-memory Map only for `dev`.
- **Secrets:** Google Secret Manager. Required entries: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (32-byte random value as 64 hex chars), `SENTRY_DSN` (optional). The container reads plain env vars at boot (Cloud Run “secret as env var”); see [Secret Manager (staging)](#secret-manager-staging).
- **Networking & egress:** public ingress via Cloud Run; egress to Google APIs is direct. Anthropic egress hits us at `160.79.104.0/21` — used as a sanity allowlist for monitoring, not enforcement.
- **Container registry:** Artifact Registry under the same GCP project, repo `gdrive-mcp`.
- **DNS / TLS:** Cloud Run-provided URLs in v1; custom domain via Cloud Run domain mapping is documented but optional.

## CI/CD pipelines

CI uses GitHub Actions; structure mirrors a tiered model:

| Workflow             | Trigger                       | Jobs                                                                                                                                                            | Pass criterion                          |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `pr-validation.yml`  | `pull_request`                | install, lint, typecheck, unit, targeted (per `docs/tests/<id>-targets.txt`), markdown lint                                                                     | all jobs green; required for merge      |
| `ci.yml`             | `push` to `main`              | full regression (tests + `TOK-*` targets), summary artifact, **Docker build**, optional **Artifact Registry push** (WIF secrets); deploy to staging is **S0.5** | regression green; image built every run |
| `release.yml`        | tag `v*.*.*`                  | promote staging image to prod via Cloud Run revision, run prod smoke, create GitHub Release                                                                     | green prod smoke                        |
| `security.yml`       | `pull_request`, weekly `cron` | dependency scan (Dependabot + `npm audit --omit=dev`), secret scan (gitleaks), container scan (trivy)                                                           | no high/critical findings unwaived      |
| `connector-test.yml` | manual `workflow_dispatch`    | spin ngrok tunnel + run MCP Inspector against staging or PR-preview                                                                                             | passing tools/list and OAuth            |

CI runners use a least-privilege Workload Identity Federation principal. Deploy credentials never live in repo secrets.

## Bootstrapping checklist (Epic 0)

- [ ] GCP project created (one per env, or one project with three Cloud Run services — pick at Epic 0 kickoff).
- [ ] Artifact Registry repo `gdrive-mcp` provisioned.
- [ ] Secret Manager entries seeded: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, optional `SENTRY_DSN` (same secret **ids** as env var names; values from OAuth client + `openssl rand -hex 32`).
- [ ] Workload Identity Federation principal for GitHub Actions deploys (least privilege: Cloud Run admin scoped to the service, Artifact Registry writer, Secret Manager accessor).
- [ ] Memorystore Redis instance + Serverless VPC Access connector for staging/prod.
- [ ] OAuth client in GCP with `https://claude.ai/api/mcp/auth_callback` and loopback URIs as authorized redirects.
- [ ] DNS / TLS strategy decided (Cloud Run URL vs custom domain).
- [ ] CI workflows committed under `.github/workflows/`.
- [ ] First green deploy to `staging`.
- [ ] First successful `tools/list` against `staging` from MCP Inspector.

## Secret Manager (staging)

Create secrets in the **staging** GCP project using these **secret ids** (each value is the string you would put in `.env`; map the secret to a Cloud Run environment variable with the **same name**):

| Secret id (GCP)        | Env var                | How to obtain                                                                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | `GOOGLE_CLIENT_ID`     | OAuth 2.0 Client ID from Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | OAuth client secret (rotate if exposed)                                       |
| `SESSION_SECRET`       | `SESSION_SECRET`       | Run `openssl rand -hex 32` once per environment; treat like a root password   |
| `SENTRY_DSN` (opt.)    | `SENTRY_DSN`           | Sentry project DSN if error tracking is enabled                               |

Example (replace project id and enable APIs first):

```bash
gcloud secrets create GOOGLE_CLIENT_ID --project=YOUR_STAGING_PROJECT --replication-policy=automatic
echo -n '123456789-abc.apps.googleusercontent.com' | gcloud secrets versions add GOOGLE_CLIENT_ID --data-file=-
```

Repeat for each row. Wire Cloud Run **Edit & deploy new revision → Variables & secrets → Reference a secret** so the service receives the vars the binary validates against `env.example`.

## Configuration & promotion

- All environment configuration is sourced from environment variables read at boot. The repo contains an `env.example` with the full required set; secrets are loaded from Secret Manager.
- Image promotion is image-digest-based (the same image tagged for staging is the one promoted to prod) — never rebuild between staging and prod.

## Failure & rollback

- Cloud Run keeps the previous revision; rollback is a single `gcloud run services update-traffic` call. Documented in the README operator section.
- Database / state: Redis sessions are TTL'd; loss of Redis state forces users to re-authenticate but does not corrupt long-term data.
