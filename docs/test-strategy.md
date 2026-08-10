# Test Strategy — {project_name}

Generated during `/foundation-cicd`. Customise thresholds and tool choices here.
CI workflows in `.github/workflows/` must match the scripts listed in this file.

---

## Test pyramid

| Tier | Tool | Target coverage | When runs | Notes |
|------|------|----------------|-----------|-------|
| Unit | **Vitest** + coverage-v8 | 80% lines/branches | PR + main | Pure logic, no I/O |
| API / Integration | **Supertest** + **Testcontainers** | 70% of endpoints | PR + main | Real DB in Docker |
| Component | **RTL** + **Storybook test-runner** | All primitives | PR + main (UI PRs) | Render + a11y per story |
| E2E | **Playwright** | Critical user flows | PR + main | Cross-browser |
| Visual regression | Playwright `toHaveScreenshot()` | 100% primitives + key routes × theme × breakpoint | PR (UI changes) | Snapshots committed |
| Storybook visual | `@storybook/test-runner --hooks=./visual-regression.js` | All stories | PR (UI changes) | Story-level screenshots where configured |
| Accessibility | `@axe-core/playwright` | Every page route, WCAG 2.1 AA | PR (UI changes) | Zero new violations |
| Lighthouse | Lighthouse CI | LCP < 2.5s, CLS < 0.1 | PR/main for key routes | Performance budget |

---

## Story TDD loop

Story implementation uses vertical TDD, not horizontal test batching.

- Tess writes `docs/tests/<story-id>.md` as the test architecture: applicable tiers, public interfaces, AC mapping, boundary mocks/fakes, behavior slice order, and the first tracer bullet.
- Cody executes one behavior slice at a time: add one behavior test, prove RED for the expected reason, implement the minimal code to make it GREEN, append the concrete target, then move to the next slice.
- Tests should verify observable behavior through public interfaces. Avoid testing private methods, internal collaborators, call order, or implementation-only data shape.
- Mock only system boundaries: external APIs, time/randomness, filesystem, and infrastructure that cannot be exercised cheaply. Prefer real project code paths and test containers for owned behavior.
- After all slices are green, run a post-green refactor review for duplication, shallow modules, long methods, feature envy, and test coupling. Rerun targeted tests after each refactor step.
- The story test report must include the tracer bullet, red/green evidence for each behavior slice, the refactor review, progression evidence, and regression membership.

---

## Regression scope — the four tiers

Regression is tiered by event. Running the whole suite after every story makes an epic's
test cost grow with the number of stories in it, and buys nothing: the same tests pass
again for the same reason.

| Event | Command | Suites | Regression targets |
| --- | --- | --- | --- |
| Red-green slice | `--scope slice` | `test:unit` | none — the story's own tests are the point |
| Story close | `--scope story` | `test:unit`, `test:integration`, `test` | this story's targets + smoke + the epic's areas |
| Epic close | `--scope epic --epic-close` | adds `test:component`, `test:e2e` | Tess's risk-selected subset |
| Promotion / release | `--scope release` | everything, incl. `test:visual`, `test:a11y` | all |

**Escalation outranks narrowing.** A dependency or build-config change (lockfile,
`Dockerfile`, `tsconfig`), or a repo with no recorded full pass, forces the full suite
regardless of what was requested. The resolver prints the scope and the reason on every run.

**Out-of-scope suites are recorded as `skip` with a reason, never omitted and never
counted as passing.** A report that says twelve suites green must mean twelve suites ran.

There is deliberately **no story-count ceiling by default**. Full regression is a promotion
event, not a calendar one. A team that wants a safety net sets `maxStoriesBetweenFull` and
gets an escalation when the count is reached.

## Quality gate — PR (merge criteria)

All items must be green before merge:

- [ ] `npm run lint` — zero errors
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run test:unit -- --coverage` — all pass, coverage ≥ thresholds
- [ ] `npm run coverage:check` — threshold enforcement
- [ ] `npm run test:integration` — all pass (Supertest + Testcontainers, requires Docker)
- [ ] `npm run test:storybook` — all Storybook stories pass (component tier, UI PRs only)
- [ ] `npm run test:storybook:visual` — story visual snapshots pass (UI PRs only, when configured)
- [ ] `npm run test:e2e` — critical flows pass
- [ ] `npm run test:visual` — Playwright screenshots pass for primitives and key routes (UI PRs only)
- [ ] `npm run test:a11y` — axe scans pass for every page route touched by the PR
- [ ] `npm run lhci` — Lighthouse budgets pass for key routes
- [ ] Secret scan (gitleaks) — no secrets
- [ ] `tools/check-story-artifacts.sh` — story artefacts present (story PRs only)

---

## Quality gate — main regression

- Full `tests/regression/regression-targets.txt` suite green
- Coverage must not drop below PR thresholds
- Auto-deploy to staging on green

---

## Local full run

Single entry point for agents and humans:

```bash
node scripts/run-all-tests.cjs              # all test:* tiers + regression targets (scope: story)
node scripts/run-all-tests.cjs --scope=full # force the whole accumulated regression list
node scripts/local-ci-gate.cjs              # docker build + full suite + report verify (merge gate)
powershell -File scripts/run-all-tests.ps1  # Windows wrapper
```

Outputs: `reports/test-summary.html` + `reports/test-summary.json`.

---

## Test infrastructure hygiene

Killed runs (SIGKILL, IDE stop, OOM) leave Testcontainers containers and orphaned vitest/playwright/node processes.

```bash
node scripts/reap-test-hygiene.cjs    # Testcontainers + orphan test PIDs for this project
```

Automatically invoked at start/end of `run-targeted-tests.sh`, `run-all-tests.cjs`, and in `local-ci-gate.cjs` `finally`.

---

## Verify tests actually ran

CI or local runners may exit green while producing **zero** junit tests (timeouts, misconfigured reporters).

```bash
node scripts/verify-test-reports.cjs --reports-dir reports --min-tests 1
```

`local-ci-gate.cjs` and GitHub workflows (`pr-ci.yml`, `main-regression.yml`) call this after test steps. **Never treat CI green as pass without checking test counts.**

---

## Setup commands

```bash
# Unit
pnpm add -D vitest @vitest/coverage-v8

# API / Integration
pnpm add -D supertest @types/supertest testcontainers

# Component
pnpm add -D @testing-library/react @testing-library/user-event jsdom
pnpm add -D @storybook/test-runner @storybook/addon-a11y

# E2E
pnpm add -D @playwright/test @axe-core/playwright
pnpm add -D @lhci/cli
npx playwright install --with-deps chromium firefox webkit
```

---

## Testcontainers pattern (API tests)

```typescript
// tests/integration/setup.ts
import { PostgreSqlContainer } from "testcontainers"

let pg: PostgreSqlContainer

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("testdb")
    .withUsername("test")
    .withPassword("test")
    .start()
  process.env.DATABASE_URL = pg.getConnectionUri()
  // run migrations
  await migrate(process.env.DATABASE_URL)
}, 60_000)

afterAll(async () => {
  await pg?.stop()
})
```

```typescript
// tests/integration/users.test.ts
import supertest from "supertest"
import { createApp } from "../../src/app"

const app = createApp()

test("POST /api/users creates user", async () => {
  await supertest(app)
    .post("/api/users")
    .send({ email: "test@example.com", name: "Test" })
    .expect(201)
    .expect(res => {
      expect(res.body.id).toBeDefined()
      expect(res.body.email).toBe("test@example.com")
    })
})
```

---

## Coverage thresholds (enforce in vitest.config.ts)

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      exclude: ["**/*.config.*", "**/generated/**", "**/*.d.ts"],
    },
  },
})
```

---

## Visual regression policy

- Snapshots committed to `tests/visual/snapshots/`
- Breakpoints: 320px (mobile), 768px (tablet), 1280px (desktop)
- Themes: light + dark
- Key page routes must have route-level screenshots, not only component snapshots.
- Update command: `npx playwright test --update-snapshots` (reviewed in PR diff)
- Drift threshold: 0% — any pixel change fails the check. Use `maxDiffPixelRatio: 0.001` only for animated elements.

---

## Accessibility policy

- Every page route touched by a UI story gets an `@axe-core/playwright` test.
- Violations are blocking unless documented as pre-existing and tracked.
- Focus order, keyboard operation, names/roles, and error announcements are verified in E2E or Storybook interaction tests.

---

## Lighthouse policy

- Key routes: home, auth entry, primary dashboard/list, primary detail, and checkout/payment if present.
- Budgets: LCP < 2.5s and CLS < 0.1.
- CI uses `npm run lhci` once routes are deployed or locally served.

---

## Flaky test policy

- Flaky definition: failure rate >1% over 20 runs
- Auto-quarantine: move to `tests/quarantine/`, open tracking issue
- Investigation deadline: 5 working days
- Resolution options: fix or formally remove (never silently skip)
- Quarantined tests run in separate CI job (reporting only, not gate)

---

## Script reference (`package.json`)

```json
{
  "scripts": {
    "test:unit":        "vitest run",
    "test:unit:watch":  "vitest",
    "test:integration": "vitest run tests/integration",
    "test:storybook":   "test-storybook",
    "test:e2e":         "playwright test",
    "test:visual":      "playwright test tests/visual",
    "test:storybook:visual": "test-storybook --hooks=./visual-regression.js",
    "test:a11y":        "playwright test tests/a11y",
    "lhci":             "lhci autorun",
    "coverage:check":   "vitest run --coverage",
    "coverage:json":    "vitest run --coverage --reporter=json"
  }
}
```
