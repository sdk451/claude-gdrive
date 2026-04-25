---
story: TOK-7
title: S0.2 — CI: PR validation pipeline
persona: Plan
status: approved
date: 2026-04-26
sources:
  - docs/test-strategy.md
  - docs/environments.md
  - docs/backlog.md
---

# Design: CI — PR validation pipeline

## Goal

Extend `.github/workflows/pr-validation.yml` so every PR to `main` runs install,
typecheck, ESLint, unit tests, **markdown lint** (via `markdownlint-cli2`), and
the **targeted-test runner** (`scripts/run-targeted-tests.sh`) against this
story’s targets file. Add **concurrency** with `cancel-in-progress` so newer
pushes supersede stale runs.

## Scope

In:

1. **Workflow** — `concurrency` group keyed by PR number; single `validate` job
   with steps: checkout → pnpm → Node 22 → `pnpm install --frozen-lockfile` →
   `pnpm typecheck` → `pnpm lint` → `pnpm lint:md` → `pnpm test` →
   `bash scripts/run-targeted-tests.sh docs/tests/TOK-7-targets.txt`.
2. **Markdown lint** — `markdownlint-cli2` devDependency; `pnpm lint:md` script;
   `.markdownlint-cli2.jsonc` with pragmatic disables and ignores for kit
   seeds, diary, autonomous-swe-kit tree, `.cursor`, `.specify`, and
   `node_modules`.
3. **Contract test** — `tests/unit/ci-pr-validation.test.ts` reads the workflow
   YAML and asserts `concurrency`, `cancel-in-progress`, `lint:md`, and the
   targeted-test invocation with `TOK-7-targets.txt`.
4. **Targets** — `docs/tests/TOK-7-targets.txt` (unit: server regression +
   CI contract test). **Alias** `docs/tests/S0.2-targets.txt` with identical
   lines so backlog paths stay valid.
5. **README** — new root `README.md` documenting how to enable the required
   status check in GitHub (`validate` job under `pr-validation` workflow).

Out (later stories):

- `ci.yml` / container / WIF → S0.3.
- Security scans → S0.8.

## Verification

- Local: `pnpm install && pnpm typecheck && pnpm lint && pnpm lint:md && pnpm test && bash scripts/run-targeted-tests.sh docs/tests/TOK-7-targets.txt`
- CI: trivial PR green in under ~5 minutes (single job, cached pnpm).
