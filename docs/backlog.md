---
title: Backlog — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
linear_team: Tokenomik
---

## Conventions

- IDs: `E<n>` for epics, `S<n>.<m>` for stories.
- Each story carries: **Goal**, **Acceptance Criteria** (Given/When/Then or checkbox), **Test targets file** (`docs/tests/<id>-targets.txt`), **Dependencies**, and **Source links** (PRD requirement IDs and architecture sections).
- **Epic 0 (Foundation) must be Done before any feature epic starts.** This is enforced by the Implementation-Readiness Gate in step 10 of the onboarding workflow.
- Acceptance criteria reference functional/non-functional IDs from `docs/prd.md` (`F-*`, `NF-*`, `P-*`) where applicable.

---

## Epic 0 — Foundation (mandatory)

**Goal:** Stand up the target environments, CI/CD, observability, secret management, and test architecture so feature work can ship safely. No feature stories merge until Epic 0 passes the readiness gate.

### S0.1 — Repo bootstrap & dev environment

**Goal:** A clean repo skeleton (TypeScript, ESM, Node 22), formatting, lint, typecheck, and a runnable `pnpm dev` that boots the empty Hono server.

- AC1: `pnpm install && pnpm typecheck && pnpm lint && pnpm test` all pass on a fresh checkout.
- AC2: `pnpm dev` boots Hono on `$PORT` and serves a `/healthz` 200.
- AC3: `node --version` enforced via `engines` and a CI matrix entry.
- Test targets: `docs/tests/S0.1-targets.txt`
- Dependencies: none
- Sources: `docs/tech-stack.md` (runtime), `docs/environments.md` (dev)

### S0.2 — CI: PR validation pipeline

**Goal:** GitHub Actions `pr-validation.yml` runs install + lint + typecheck + unit + targeted + markdown lint on every PR.

- AC1: Workflow file committed under `.github/workflows/pr-validation.yml`.
- AC2: A trivial PR runs all jobs green in under 5 minutes.
- AC3: Required-status-check rule recorded in repo settings (documented in README).
- Test targets: `docs/tests/S0.2-targets.txt`
- Dependencies: S0.1
- Sources: `docs/test-strategy.md` (CI tiering), `docs/environments.md` (pipelines)

### S0.3 — CI: main branch + container build

**Goal:** `ci.yml` runs the full suite on `push` to `main`, builds the container, pushes to Artifact Registry.

- AC1: Container builds reproducibly from `Dockerfile` with `node:22-bookworm-slim`.
- AC2: Image pushed to Artifact Registry under `gdrive-mcp` repo, tagged with commit SHA.
- AC3: Workload Identity Federation principal used (no long-lived service-account key in repo secrets).
- Test targets: `docs/tests/S0.3-targets.txt`
- Dependencies: S0.2
- Sources: `docs/environments.md` (infrastructure)

### S0.4 — Secrets & config management

**Goal:** All secrets live in Secret Manager; the runtime reads them at boot. `env.example` documents the full env var surface.

- AC1: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (32-byte hex), optional `SENTRY_DSN` provisioned in Secret Manager for staging.
- AC2: Container fails fast if any required env var is missing, with a single-line error pointing to `env.example`.
- AC3: No `.env` files or secret values committed; `.gitleaks` config in repo.
- Test targets: `docs/tests/S0.4-targets.txt`
- Dependencies: S0.1
- Sources: `docs/constitution.md` (non-negotiables), `docs/observability.md` (redaction)

### S0.5 — Staging deploy from main

**Goal:** Merge to `main` deploys a new revision to Cloud Run staging with image-digest promotion semantics.

- AC1: A merge to `main` produces a green Cloud Run revision in `gdrive-mcp-staging`.
- AC2: `/healthz` and `/.well-known/oauth-authorization-server` return 200 against the staging URL.
- AC3: Rollback to previous revision is documented in the README and tested once.
- Test targets: `docs/tests/S0.5-targets.txt`
- Dependencies: S0.3, S0.4
- Sources: `docs/environments.md`

### S0.6 — Observability baseline (logs + redaction)

**Goal:** Structured `pino` JSON logs with required correlation fields and the redaction config in place. Cloud Logging captures them.

- AC1: Every HTTP request emits a log line with `request_id`, `session_id_hash`, `outcome`, `latency_ms`.
- AC2: Redaction config covers `authorization`, `cookie`, `access_token`, `refresh_token`, `code`, `id_token`. Verified by a unit test that feeds these fields and asserts `[redacted]`.
- AC3: A Cloud Logging-based "secret-in-log" canary alert is configured.
- Test targets: `docs/tests/S0.6-targets.txt`
- Dependencies: S0.1, S0.5
- Sources: `docs/observability.md`

### S0.7 — Test harness & targeted-test runner

**Goal:** Vitest configured for unit + contract + integration tiers; `scripts/run-targeted-tests.sh` exists and is wired into the `verify-completion-promise` hook.

- AC1: `pnpm test:unit`, `pnpm test:contract`, `pnpm test:integration` run in isolation.
- AC2: `scripts/run-targeted-tests.sh docs/tests/<id>-targets.txt` runs only the listed tests and exits non-zero on any failure.
- AC3: `verify-completion-promise` hook integration tested against a stub story id.
- Test targets: `docs/tests/S0.7-targets.txt`
- Dependencies: S0.1
- Sources: `docs/test-strategy.md`

### S0.8 — Security baseline

**Goal:** `security.yml` runs Dependabot config, `npm audit`, `gitleaks`, `trivy` on PRs and weekly cron.

- AC1: Workflow committed; first scan green.
- AC2: High/critical findings block merge; medium/low warn.
- AC3: Dependabot enabled for npm + GitHub Actions versions.
- Test targets: `docs/tests/S0.8-targets.txt`
- Dependencies: S0.2
- Sources: `docs/environments.md`, `docs/test-strategy.md`

### S0.9 — Production deploy gate

**Goal:** `release.yml` promotes a tagged staging image to prod via image-digest, runs prod smoke tests.

- AC1: Tag `v0.1.0-rc1` produces a green prod revision.
- AC2: Prod smoke tests cover `/healthz`, `/.well-known/oauth-authorization-server`, and a stubbed `tools/list` response.
- AC3: Single-command rollback documented and tested.
- Test targets: `docs/tests/S0.9-targets.txt`
- Dependencies: S0.5, S0.8
- Sources: `docs/environments.md`

### S0.10 — Implementation-readiness gate

**Goal:** Confirm Epic 0 is actually delivered using the `check-implementation-readiness` workflow (or the inline criteria in `step-10-readiness.md`).

- AC1: Every checkbox in step-10-readiness inline criteria is `[x]` with evidence link.
- AC2: A Linear comment on the Epic 0 issue records the gate decision (PASS).
- AC3: First feature story (`S1.1`) is moved to `Ready` in Linear.
- Test targets: none (gate)
- Dependencies: S0.1–S0.9
- Sources: onboarding workflow step 10

---

## Epic 1 — MCP server skeleton (Streamable HTTP + OAuth discovery)

**Goal:** A working MCP server with Streamable HTTP transport, correct session semantics, OAuth discovery endpoint, and an empty (but well-structured) tool registry.

### S1.1 — Streamable HTTP transport

- AC1: `POST /mcp`, `GET /mcp`, `DELETE /mcp` implemented per MCP spec (F-01).
- AC2: `mcp-session-id` assigned on `initialize` and validated on subsequent calls (F-02).
- AC3: Contract tests cover all three verbs.
- Test targets: `docs/tests/S1.1-targets.txt`
- Sources: `docs/architecture.md` (HTTP layer), `docs/prd.md` F-01/F-02

### S1.2 — Tool registry plumbing (empty)

- AC1: `tools/list` returns the registered tool set (initially empty list, structurally valid) (F-03).
- AC2: `tools/call` returns a structured "no such tool" error for unknown names (F-04).
- AC3: Tool result content is text-first and well-typed.
- Test targets: `docs/tests/S1.2-targets.txt`
- Sources: `docs/prd.md` F-03/F-04

### S1.3 — OAuth discovery endpoint

- AC1: `/.well-known/oauth-authorization-server` returns conformant metadata (F-05).
- AC2: Discovery is reachable without auth and within 200 ms p95.
- Test targets: `docs/tests/S1.3-targets.txt`
- Sources: `docs/prd.md` F-05, `docs/architecture.md`

### S1.4 — DCR or CIMD onboarding

- AC1: Either DCR or CIMD path implemented; the other documented as a follow-up (F-06).
- AC2: PKCE enforced on authorization code flow (F-07).
- AC3: Hosted Claude callback `https://claude.ai/api/mcp/auth_callback` accepted (F-11).
- Test targets: `docs/tests/S1.4-targets.txt`
- Sources: `docs/prd.md` F-06/F-07/F-11

### S1.5 — Token refresh

- AC1: Access-token refresh is automatic and silent (F-08).
- AC2: Refresh failure surfaces a clean re-auth signal to the client.
- AC3: Refresh tokens stored encrypted at rest with AES-256-GCM (NF-03).
- Test targets: `docs/tests/S1.5-targets.txt`
- Sources: `docs/prd.md` F-08, NF-03

---

## Epic 2 — Drive tools (Must-have set)

### S2.1 — `search_files`

### S2.2 — `read_file_content`

### S2.3 — `download_file_content`

### S2.4 — `get_file_metadata`

### S2.5 — `get_file_permissions`

### S2.6 — `create_file`

Each story:

- Maps to one Drive endpoint per `docs/architecture.md`'s tool→endpoint table.
- Includes a contract test for the tool's `inputSchema` and an integration test against stubbed Drive responses.
- Adds `readOnlyHint`/`destructiveHint` annotations correctly.
- Test targets: `docs/tests/S2.<n>-targets.txt`

---

## Epic 3 — Drive tools (Should-have set)

### S3.1 — `update_file`

### S3.2 — `move_file`

### S3.3 — `share_file`

### S3.4 — `list_folder`

Same structural contract as Epic 2. Destructive ops (`update_file` large payloads, `move_file`, `share_file`) carry `destructiveHint: true`.

---

## Epic 4 — Plugin packaging

### S4.1 — `.claude-plugin/plugin.json` + `.mcp.json`

- AC: Plugin installs in Cowork via ZIP upload (P-01, P-02, P-05).

### S4.2 — Skills + optional slash commands

- AC: At least one skill file describing Drive search syntax (P-03). Slash commands optional in v1 (P-04).

### S4.3 — Operator README

- AC: Complete setup guide covers Cloud Run deploy, OAuth client config, plugin install (P-07).

---

## Epic 5 — Hardening & launch readiness

### S5.1 — `tools.list` regression suite (the original Anthropic bug)

- AC1: `tools.list.returns_full_set_after_oauth` test passes on every PR.
- AC2: `tools.list.never_empty_post_init` chaos test passes.
- AC3: `tools_list_empty_total` metric instrumented and alarmed.

### S5.2 — Latency budget enforcement

- AC1: p95 tool round-trip ≤ 3 s on staging under 100 RPS synthetic load.
- AC2: Latency dashboard committed to repo.

### S5.3 — Indirect prompt-injection mitigations

- AC1: `destructiveHint` annotations correct on all destructive tools.
- AC2: Docs page explaining injection risks and mitigations linked from README.

### S5.4 — Docs and runbooks complete

- AC1: README, operator guide, runbooks for every pageable alert published.
- AC2: MCP Inspector validation script committed.

---

## Epic 6 — v2 backlog (parking lot)

Captured for visibility only; not scheduled for v1:

- Shared Drives / Team Drives.
- Sheets cell-level read/write.
- Docs surgical editing.
- Drive change webhooks.
- Calendar parity (only if the bundled Calendar connector regresses).
- Multi-tenant hosted SaaS.
- Anthropic connectors-directory submission.
