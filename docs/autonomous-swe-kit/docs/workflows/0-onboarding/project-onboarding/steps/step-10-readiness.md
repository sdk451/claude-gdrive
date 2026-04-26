# Step 10 — Implementation-Readiness Gate (Epic 0)

**Personas:** Test Architect (Tess), Platform Engineer (Plat)
**Inputs:** `docs/environments.md`, `docs/observability.md`, `docs/test-strategy.md`, Linear Epic 0
**Output:** Pass/fail decision recorded in `docs/_onboarding-state.md` and Linear

## Goal

Confirm Epic 0 has actually been delivered (or is at least demonstrably ready to be delivered by the implementation loop) before any feature work begins.

## Procedure

1. **Locate the readiness checker.** If [`docs/autonomous-swe-kit/docs/workflows/3-solutioning/check-implementation-readiness/workflow.md`](../../../3-solutioning/check-implementation-readiness/workflow.md) exists, run it. Otherwise run an inline check using the criteria below.
2. **Inline criteria** (record yes/no with evidence link):
   - [x] CI runs lint + typecheck + unit + targeted tests on every PR — evidence: `.github/workflows/pr-validation.yml`, `docs/test-strategy.md`
   - [x] Container builds and pushes to a registry — evidence: `.github/workflows/ci.yml` (`container` job), `Dockerfile`
   - [x] Staging deploy works from main — evidence: `.github/workflows/ci.yml` (`deploy_staging` job), `README.md`
   - [x] Secrets are managed via Secret Manager / Workers Secrets / equivalent (no `.env` checked in) — evidence: `env.example`, `docs/environments.md`, `src/config/env.ts`
   - [x] Structured logs visible in target environment — evidence: `src/observability/logger.ts`, `src/server.ts`, `docs/observability.md`
   - [x] Error tracking receives a test event — evidence: `docs/observability.md`, `env.example` (`SENTRY_DSN`), `src/observability/sentry-readiness.ts`, `GET /__smoke/sentry-test` in `src/server.ts`
   - [x] `scripts/run-targeted-tests.sh` runs end-to-end — evidence: `scripts/run-targeted-tests.sh`, `docs/tests/TOK-6-targets.txt`
   - [x] `verify-completion-promise` hook is registered and exits 0 when the branch has no story id (no-op) — evidence: `.cursor/hooks.json`, `.cursor/hooks/verify-completion-promise.sh`
3. **Record the gate result** in `docs/_onboarding-state.md` and as a Linear comment on the Epic 0 issue. If failing, list which Epic 0 stories must be reopened.
4. **Append state.**

```markdown
## <ts> — step-10-readiness — tess+plat

- Status: complete
- Decision: PASS|FAIL
- Significant: yes
```

## Status Menu (halt and wait)

```
Readiness gate: PASS|FAIL
[C] Continue to step 11 (Handoff to per-story loop)
[R] Reopen failed stories in Linear
[X] Stop
```

If `C`: read and follow `step-11-handoff.md`.
