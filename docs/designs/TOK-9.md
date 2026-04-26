---
story: TOK-9
title: S0.4 — Secrets & config management
persona: Plan
status: approved
date: 2026-04-26
sources:
  - docs/backlog.md
  - docs/constitution.md
  - docs/environments.md
---

# Design: Secrets & config management

## Goal

Document the full runtime env surface in `env.example`. Validate required
secrets at process boot in `src/index.ts` so containers exit immediately with a
single-line stderr message pointing at `env.example`. Operators provision
values in Google Secret Manager for staging (and later prod) and map them into
Cloud Run as environment variables.

## Scope

In:

1. **`src/config/env.ts`** — pure `parseBootEnv(env)` with required
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` (64 hex
   chars = 32 bytes). No `process.exit` here.
2. **`src/index.ts`** — call `parseBootEnv()` before `createApp()` / `serve`;
   on failure write one line to stderr and `process.exit(1)`.
3. **`env.example`** — every supported variable with comments (including
   optional `REDIS_URL`, `SENTRY_DSN`, `PORT`, `NODE_ENV`).
4. **`.gitleaks.toml`** — extend default rules; allowlist `env.example` and the
   boot-env unit test file for documented placeholders.
5. **`tests/unit/boot-env.test.ts`** — validation matrix.
6. **`vitest.config.ts`** — inject safe CI defaults so `pnpm test` passes without
   a developer `.env`.
7. **`docs/environments.md`** + **`README.md`** — Secret Manager secret ids for
   staging and local setup pointers.
8. **`docs/tests/TOK-9-targets.txt`** and **`docs/tests/S0.4-targets.txt`**.

Out (later):

- Reading Secret Manager from Node without Cloud Run env injection — operators
  use Cloud Run “Secrets as env vars” or volume mounts; no SDK change in this
  story.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm lint:md`, `pnpm test`,
  `bash scripts/run-targeted-tests.sh docs/tests/TOK-9-targets.txt`.
- Local: `GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y SESSION_SECRET=$(openssl rand -hex 32) pnpm dev` serves `/healthz`.
