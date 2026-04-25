---
story: TOK-6
title: S0.1 — Repo bootstrap & dev environment
persona: Plan
status: approved
date: 2026-04-25
sources:
  - docs/architecture.md
  - docs/tech-stack.md
  - docs/environments.md
  - docs/test-strategy.md
  - docs/constitution.md
---

# Design: Repo bootstrap & dev environment

## Goal

A clean, runnable TypeScript ESM repo on Node 22 with the four standard gates (install, typecheck, lint, test) and a Hono server exposing `GET /healthz` that boots under `$PORT`.

This story is the foundation every subsequent epic depends on. It must intentionally **not** add MCP, OAuth, Drive client, or business logic — those belong to Epic 1 onward.

## Scope

In:

1. `package.json` with `"type": "module"`, `engines.node = ">=22 <23"`, scripts (`dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`), runtime deps (`hono`, `@hono/node-server`), and dev deps (`typescript`, `tsx`, `vitest`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `eslint-config-prettier`, `@types/node`).
2. `tsconfig.json` — strict, `module: NodeNext`, `target: ES2022`, `outDir: dist`, `rootDir: src`.
3. `eslint.config.js` (flat config, ESLint v9) wiring `@eslint/js`, `typescript-eslint`, and `eslint-config-prettier`.
4. `.prettierrc.json` and `.prettierignore`.
5. `vitest.config.ts` — Node environment, `tests/**/*.test.ts` glob.
6. `.nvmrc` pinned to `22`.
7. `.editorconfig` for cross-OS consistency.
8. `env.example` documenting the runtime envvars this story uses (`PORT`).
9. `src/server.ts` — exports a `createApp()` factory returning a Hono app with `GET /healthz` returning `{ status: "ok" }` and 200.
10. `src/index.ts` — entry point that reads `process.env.PORT` (default `3000`), calls `createApp()`, and starts `@hono/node-server`.
11. `tests/unit/server.test.ts` — vitest test that uses `app.fetch` to assert `GET /healthz` returns `200` and `{ status: "ok" }`.
12. `.github/workflows/pr-validation.yml` — minimal scaffold with a Node 22 matrix entry running `install → typecheck → lint → test`. **S0.2 extends** this with targeted tests, markdown lint, and concurrency cancellation.
13. `docs/tests/TOK-6-targets.txt` listing the unit test for the targeted-test runner.

Out (deferred):

- Dockerfile / container build → S0.3.
- Secret manager integration, full env.example surface → S0.4.
- Targeted-test runner integration into CI → S0.7.
- Markdown lint, dependency / secret / container scans → S0.2 + S0.8.
- Logging (`pino`), error tracking (Sentry), redaction → S0.6.

## Architecture

```text
src/
├── server.ts        # createApp() — Hono app, no side-effects on import
└── index.ts         # process.env.PORT, serve(createApp())

tests/
└── unit/
    └── server.test.ts  # app.fetch('/healthz') → 200 + { status: "ok" }
```

`createApp()` is exported so tests can hit the app via `app.fetch(new Request(...))` without binding a port. `index.ts` is the only place that touches `process.env` and `serve(...)`.

## Acceptance criteria — verification

- AC1: `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass on a fresh checkout. Verified by sequential local run and the CI matrix entry.
- AC2: `pnpm dev` boots Hono on `$PORT` and `GET /healthz` returns 200. Verified by manual smoke (`PORT=3000 pnpm dev`, then `curl /healthz`) plus the unit test that exercises the same handler.
- AC3: `node --version` enforced via `engines` and a CI matrix entry. Verified by `package.json#engines.node = ">=22 <23"` and `.github/workflows/pr-validation.yml` matrix `node: [22.x]`.

## Risks & mitigations

- **Windows line endings** — `.gitattributes` already enforces `eol=lf` for `*.sh / *.md / *.json / *.yml / *.yaml`. No change needed.
- **ESLint v9 flat config churn** — pin `eslint@^9`, `typescript-eslint@^8`, `@eslint/js@^9`.
- **Hex/px in code** — `enforce-tokens.sh` only fires under `components/**` / `app/**`. Server code under `src/**` is unaffected.
- **`pnpm test` side-effects** — Vitest test imports `createApp()` from `src/server.ts`; `src/index.ts` is not imported by tests, so `serve()` never runs in CI.

## Out-of-scope guardrails

- Do **not** add `@modelcontextprotocol/sdk`, `googleapis`, `ioredis`, `pino`, or Sentry in this story.
- Do **not** add `dotenv` — `process.env` is read directly; secret loading is S0.4's concern.
