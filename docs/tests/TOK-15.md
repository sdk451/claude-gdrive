# TOK-15 — Test notes (S0.10)

## Goal

Prevent regression of the implementation-readiness gate: step-10 checkboxes stay satisfied and the optional Sentry probe behaves predictably.

## Suites

- **Unit:** `implementation-readiness-gate.test.ts` — step-10 markdown structure + hook registration facts.
- **Unit:** `sentry-readiness-route.test.ts` — `/__smoke/sentry-test` JSON contract; `@sentry/node` mocked when DSN present.

## Manual (ops)

- With a real DSN in staging, `curl` the smoke URL once and confirm an event in Sentry (not automated here).
