---
name: foundation-cicd
description: >
  Party-mode workflow that designs and implements Epic 0: CI/CD pipelines,
  target environments, automated quality gates, and the "Hello World" 
  baseline deploy. Run after project-onboarding. Prerequisite for /autonomous.
trigger: /foundation-cicd
model: sonnet
tools: Read, Write, Edit, Bash, Grep, Glob
---

# Foundation CI/CD Workflow

**Goal:** By the end of this workflow, the project has:
1. Defined target environments with deployment procedures
2. GitHub Actions CI/CD pipelines (PR gate, main regression, release)
3. Automated quality gates (lint, type-check, test tiers, coverage minimums)
4. "Hello World" code deployed and passing CI for every target environment
5. Epic 0 stories marked done
6. The full autonomous build can begin

**Personas (party-mode — all contribute):**
- **Tess** (Test Architect) — test architecture, quality gates, test tooling setup
- **Artemis** (Architect) — environment definitions, architectural constraints
- **Plat** (Platform Engineer) — CI/CD implementation, IaC, secrets, pipelines
- **Ume** (UX Engineer) — design system scaffold, Storybook baseline (if UI project)

**Party-mode rule:** Each section is led by one persona. All others contribute a critique round (max 5 minutes per round). Lead persona has final say.

---

## CI phase note (CI economics — `51-ci-economics.mdc`)

This workflow is the **one early, deliberate** use of GitHub Actions: you build the CI/CD pipelines and prove them by deploying the Epic 0 "Hello World" to staging. So foundation-cicd runs with GitHub Actions **enabled**:

```bash
node scripts/ci-phase.cjs active     # turn GitHub Actions on to validate the pipeline + Epic 0 staging deploy
```

When foundation-cicd completes and the per-story autonomous build begins, **defer Actions again** so the long build phase doesn't burn runner minutes — every story merges on the local CI gate:

```bash
node scripts/ci-phase.cjs deferred   # app-build phase: local gate governs merges, GitHub Actions idle
```

Re-enable (`active`) only at go-live, when you build the IaC layer and push toward staging/production. The pipeline files you write below stay in the repo the whole time; the `CI_ENABLED` repo variable that `ci-phase.cjs` flips is what gates whether their jobs run.

---

## Initialization

1. Read `docs/config.yaml`
2. Load: `docs/architecture.md`, `docs/tech-stack.md`, `docs/constitution.md`, `docs/environments.md` (if exists)
3. Load Epic 0 stories from `project/requirements/epics.md` and individual `project/requirements/E0-*.md` files
4. Check: is there an existing `docs/environments.md`? If yes, review and reconcile.
5. Check: is there an existing `.github/workflows/`? If yes, review and reconcile.

---

## Phase 1 — Environment Design (Artemis + Plat lead)

Define the target environments. Minimum required: **dev**, **staging**, **production**.  
Optional but recommended: **preview** (ephemeral per PR).

Write / update `docs/environments.md`:

```markdown
# Environments: <project_name>

## Overview
| Environment | Purpose | Deploy trigger | URL pattern |
|-------------|---------|---------------|-------------|
| dev | Local development | manual | localhost |
| preview | PR testing | PR open/update | preview-<pr>.domain.com |
| staging | Pre-release validation | merge to main | staging.domain.com |
| production | Live users | release branch | domain.com |

## Per-environment details

### dev
- Setup: <how to run locally>
- Secrets: <where stored locally>
- Database: <local or containerized>

### preview
- Provider: <Vercel / Fly.io / self-hosted>
- Lifetime: auto-delete 7 days after PR merge/close
- Secrets: <how preview envs get secrets>

### staging
- Provider: <cloud>
- Auto-deploy: yes, on every merge to main (if all CI passes)
- Promotion to prod: manual trigger

### production
- Provider: <cloud>
- Deploy: release branch + CI green + manual approval
- Rollback: <procedure>

## Secrets management
- Provider: <GitHub Secrets / Vault / AWS Secrets Manager>
- Rotation policy: <schedule>
- Zero secrets in git: enforced by gitleaks in CI
```

Critique round: Tess checks environments support all test tiers. Ume checks preview envs support visual testing.

---

## Phase 2 — Quality Gates (Tess leads)

Define the automated quality gates. These are the conditions that must pass for code to promote.

Write / update `docs/test-strategy.md` with the quality gate definitions:

```markdown
# Test Strategy & Quality Gates: <project_name>

## Test pyramid
| Tier | Tool | Coverage target | When runs |
|------|------|----------------|-----------|
| Unit | <vitest / jest / pytest> | 80% line/branch | PR + main |
| Integration/API | <supertest / httpx + testcontainers> | 70% | PR + main |
| Component | <RTL / storybook test runner> | Key components | PR + main |
| E2E | <playwright> | Critical user flows | PR + main |
| Visual regression | playwright toHaveScreenshot | 100% primitives + key routes | PR (UI changes) |
| Storybook visual | @storybook/test-runner hooks | All stories | PR (UI changes) |
| Accessibility | axe-core/playwright | Every page route, WCAG 2.1 AA | PR (UI changes) |
| Lighthouse | Lighthouse CI | LCP < 2.5s, CLS < 0.1 | PR/main key routes |

## Quality gate — PR (must pass to merge)
- [ ] lint: zero errors
- [ ] type-check: zero errors
- [ ] unit: all pass + 80% coverage
- [ ] integration: all pass
- [ ] component: all pass (UI stories only)
- [ ] e2e: critical flows pass (against preview env)
- [ ] visual: Playwright screenshots pass
- [ ] a11y: axe route scans show zero new violations
- [ ] lighthouse: key route budgets pass
- [ ] security: gitleaks (zero secrets), npm audit (no critical CVEs)

## Quality gate — main regression (must pass for staging deploy)
- All PR gate checks
- Full regression suite (all promotion tests from merged PRs)

## Quality gate — release (must pass for prod deploy)
- All main regression checks
- Manual approval required

## Flaky test policy
- Failure rate >2% over 20 runs → open a tracking/quarantine ticket (mirror to Linear when `pm_path: linear`)
- Investigation deadline: 5 working days
- Quarantine: test excluded from gate, runs in separate reporting job
```

Plat critique: are the tools chosen compatible with the CI provider? Artemis: do the targets match the architecture risk areas?

---

## Phase 3 — CI/CD Pipeline Implementation (Plat leads)

Write / update `.github/workflows/`. The kit ships `pr-ci.yml`, `main-regression.yml`, and `release.yml` already gated on the `CI_ENABLED` repository variable (`if: vars.CI_ENABLED == 'true'`) so they stay idle during the app-build phase — **preserve that gate** when you adapt them to the project's runtime. `node scripts/ci-phase.cjs active` (above) sets the variable so they run for this Epic 0 validation.

### `.github/workflows/pr-ci.yml` — PR quality gate

```yaml
name: PR CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6  # or equivalent for the project's runtime
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit -- --coverage
      - run: npm run test:integration
      - run: npm run test:e2e  # against preview env
      - name: Coverage check
        run: npm run coverage:check  # fails if below threshold
      - uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: reports/
```

*(Plat writes the full, correct YAML for the project's actual runtime and tooling.)*

### `.github/workflows/main-regression.yml` — Full regression on main

```yaml
name: Main Regression

on:
  push:
    branches: [main]

jobs:
  full-regression:
    runs-on: ubuntu-latest
    steps:
      - ... # setup
      - run: ./scripts/run-targeted-tests.sh tests/regression/regression-targets.txt
      - name: Deploy to staging (if green)
        if: success()
        run: ./scripts/deploy.sh staging
```

### `.github/workflows/release.yml` — Release pipeline

```yaml
name: Release

on:
  push:
    branches: ['release/*']

jobs:
  release-regression:
    runs-on: ubuntu-latest
    steps:
      - ... # setup
      - run: ./scripts/run-targeted-tests.sh tests/regression/regression-targets.txt
  
  deploy:
    needs: release-regression
    runs-on: ubuntu-latest
    environment: production  # requires manual approval in GitHub
    steps:
      - run: ./scripts/deploy.sh production
```

---

## Phase 4 — Hello World Implementation (Plat + Cody)

For every target environment, implement and deploy the simplest possible working application:
- A health endpoint returning `{"status": "ok", "env": "<env_name>", "version": "<version>"}`
- A root page (if UI project) showing the project name
- Passing all CI quality gates

This is Epic 0. The Implementer runs the autonomous loop for all E0 stories:
```
/autonomous E0
```

The foundation-cicd workflow is complete when:
- [ ] All E0 stories status = `done`
- [ ] Main regression CI is green
- [ ] Staging deploy is live
- [ ] `tests/regression/regression-targets.txt` contains E0 progression tests

---

## Phase 5 — Design System Baseline (Ume leads, UI projects only)

If the project has a UI layer:
- Use the three-layer UI workflow: explore disposable directions, build shadcn/Storybook primitives, precision-pass against actual tokens and screenshots.
- Install shadcn/ui v4 by default:
  ```bash
  pnpm dlx shadcn@latest init
  pnpm dlx shadcn@latest skills install
  pnpm dlx shadcn@latest add button input card dialog
  ```
- If `figma_mcp_enabled: true`, load Figma Dev Mode MCP / Code Connect context and map designer-owned components to local primitives.
- Set up design tokens (DTCG v1 format) and write `docs/design-system.md` with density, grid baseline, radius scale, font scale, and semantic color vocabulary.
- Write `docs/ux-tools.md` with shadcn, optional Figma, Stagewise, Storybook, visual, and a11y workflow notes.
- Create Storybook with at minimum: Button, Input, Card primitives
- Set up visual regression baseline: `playwright toHaveScreenshot` for all primitives and key routes
- Set up `@axe-core/playwright` route tests for every page route
- Add Storybook test runner and Storybook visual mode to PR CI
- Add Lighthouse CI budgets for key routes
- If `stagewise_enabled: true`, document `npx stagewise@latest` as the running-app precision workflow
- Install `/reskin <preset-code>` as the token-only shadcn Preset workflow

---

## Completion

Log `foundation-cicd COMPLETE` to `docs/_methodology-state.md`.

Print:
```
✓ Environments defined: docs/environments.md
✓ Quality gates defined: docs/test-strategy.md
✓ CI/CD pipelines: .github/workflows/
✓ Epic 0 stories: done
✓ Staging: live at <url>
✓ Regression suite: <n> tests
[✓ Design system: Storybook live]  (if UI)

Ready to run: /autonomous <project_name>
```
