# Step 6 — Foundation Documents

**Personas:** Platform Engineer (Plat), Test Architect (Tess), UX Engineer (Ume). Run sequentially or in party mode if available.
**Inputs:** All prior outputs.
**Outputs:** `docs/environments.md`, `docs/observability.md`, `docs/test-strategy.md`, `docs/design-system.md`

## Goal

Pin down everything Epic 0 will need to deliver: target environments, observability stance, test architecture, and (if there is a UI surface) the design system.

## Procedure

### 6a — Environments (Plat)

Load `.cursor/commands/platform-engineer.md`. Generate `docs/environments.md`:

```markdown
---
title: Environments
status: draft
---

## Targets

| Env     | Purpose           | URL/Region         | Trigger       |
| ------- | ----------------- | ------------------ | ------------- |
| dev     | local + ephemeral | localhost / tunnel | every push    |
| staging | shared prerelease | <region>           | merge to main |
| prod    | live              | <region>           | tag release   |

## Infrastructure

- Compute (Cloud Run / Workers / VPS / etc.)
- State (Redis / DO / Postgres / etc.)
- Secrets (Secret Manager / Workers Secrets / etc.)
- Networking & egress

## CI/CD pipelines

- PR validation: lint + typecheck + unit + targeted tests
- Main branch: full test suite + container build
- Release: deploy to staging → smoke → promote to prod
- Security: dependency scan, secret scan, container scan

## Bootstrapping checklist (Epic 0)

- [ ] GCP project / cloudflare account / VPS provisioned
- [ ] Secrets seeded
- [ ] CI runner has deploy credentials (least privilege)
- [ ] DNS + TLS
- [ ] Observability hooked up
```

### 6b — Observability (Plat)

Generate `docs/observability.md` covering structured logging policy (JSON shape, required correlation fields, redaction), metrics, tracing, error tracking (Sentry or equivalent), alerting thresholds, and dashboards.

### 6c — Test strategy (Tess)

Load `.cursor/commands/test-architect.md`. Generate `docs/test-strategy.md`:

```markdown
---
title: Test Strategy
status: draft
---

## Test pyramid

| Tier                   | Tooling                         | When                  | Coverage target             |
| ---------------------- | ------------------------------- | --------------------- | --------------------------- |
| Unit                   | Vitest / Jest                   | every push            | ≥80% lines on changed files |
| Integration / contract | Vitest + tunnel                 | per PR (targeted)     | all changed surface         |
| E2E                    | Playwright (if UI)              | nightly + pre-release | top user flows              |
| Manual / exploratory   | MCP Inspector, Cowork connector | per release           | critical flows              |

## Targeted-test discipline

- Each story declares its impacted test targets in `docs/tests/<story-id>-targets.txt`.
- The `verify-completion-promise` hook will only emit `STORY_COMPLETE` when those targets pass.

## CI tiering

Mirror `docs/environments.md` CI/CD section.

## Quality gates

- Lint, typecheck, unit, targeted, security scan.
```

### 6d — Design system (Ume) — optional if no UI

Generate `docs/design-system.md` with tokens (colors, spacing, type), components inventory, accessibility patterns, and surface-specific guidance.

If the project has no UI surface, write a one-line `docs/design-system.md` saying "Not applicable for this project — no UI surface in v1." and proceed.

### 6e — Append state (per sub-step)

```markdown
## <ts> — step-06-foundation-<sub> — <persona>

- Status: complete
- Output: docs/<file>.md
- Significant: yes
```

## Status Menu (halt and wait)

```
Foundation docs ready:
  docs/environments.md
  docs/observability.md
  docs/test-strategy.md
  docs/design-system.md
[C] Continue to step 7 (Backlog with Epic 0)
[R] Revise (specify which)
[X] Stop
```

If `C`: read and follow `step-07-backlog.md`.
