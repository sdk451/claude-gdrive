# TOK-15 — Implementation-readiness gate (S0.10)

## Context

Epic 0 must be demonstrably complete before S1.1. Step 10 in the onboarding kit lists inline criteria; this story turns those into checked evidence in-repo and records PASS in Linear on TOK-5.

## Approach

1. Mark every inline criterion in `step-10-readiness.md` as `[x]` with concrete evidence paths (workflows, hooks, scripts, docs).
2. Add an optional Sentry smoke path: `GET /__smoke/sentry-test` calls `@sentry/node` only when `SENTRY_DSN` is set; otherwise returns `{ status: "skipped" }` without loading the SDK.
3. Lock the gate with Vitest: parse step-10 for eight checked lines with evidence markers; exercise the smoke route with and without env + mocks.
4. Append `docs/_onboarding-state.md` and move TOK-18 (S1.1) to **Todo** (team has no “Ready” state).

## Out of scope

Changing CI topology beyond documentation; rotating production secrets.
