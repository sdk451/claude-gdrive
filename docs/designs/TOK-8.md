---
story: TOK-8
title: S0.3 — CI: main branch + container build
persona: Plan
status: approved
date: 2026-04-26
sources:
  - docs/environments.md
  - docs/backlog.md
  - docs/test-strategy.md
---

# Design: CI — main branch + container build

## Goal

On every push to `main`, after the regression suite passes, build a production
Docker image from `Dockerfile` (`node:22-bookworm-slim`, non-root). When GitHub
repository secrets for Workload Identity Federation and Artifact Registry are
present, authenticate with `google-github-actions/auth` and push the image to
`$GCP_ARTIFACT_REGISTRY:$GITHUB_SHA` (digest-addressable tag per commit).

## Scope

In:

1. **`Dockerfile`** — multi-stage: install deps with pnpm, `pnpm build`, `pnpm
prune --prod`, final stage `node:22-bookworm-slim` with `USER` non-root,
   `CMD ["node","dist/index.js"]`, default `PORT=8080`.
2. **`.dockerignore`** — shrink build context (no `node_modules`, `docs`,
   `tests`, `.git`).
3. **`.github/workflows/ci.yml`** — replaces the standalone `ci-main.yml`
   regression file: job `regression` (unchanged behaviour) + job `container`
   (`needs: regression`) that runs `docker build` and optionally WIF + push.
4. **`tests/unit/dockerfile.test.ts`** + extend **`tests/unit/ci-pr-validation.test.ts`**
   — contract that Dockerfile and `ci.yml` satisfy Epic 0 expectations.
5. **`docs/tests/TOK-8-targets.txt`** and **`docs/tests/S0.3-targets.txt`** alias.

Out (later):

- Cloud Run deploy from this image → S0.5.
- Staging smoke wired to revision URL → S0.5.

## Verification

- `pnpm test` and `docker build -t test:local .` (local smoke).
- Push to `main`: CI green without secrets; with secrets, image appears in AR.
