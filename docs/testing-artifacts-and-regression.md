# Test artifacts, regression promotion, and release train

This document refines the **autonomous SWE** loop: where test results live, how they
tie to a **story / PR / Linear issue**, how tests graduate into **regression**, and
how **main** + **release** workflows relate. It complements `docs/test-strategy.md`.

## Where test results are stored

| Location                              | What you get                                                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Actions UI**                 | Live log stream per job step (always).                                                                                                                                                                                                                                                 |
| **Workflow artifacts** (download zip) | **Human-readable** `reports/STORY_TEST_SUMMARY.md` (PRs) or `reports/MAIN_REGRESSION_SUMMARY.md` (push to `main`), plus machine-readable `reports/vitest-unit.json`, JUnit `reports/vitest-unit-junit.xml`, and `reports/targeted-tests.log` / `reports/regression-story-targets.log`. |
| **Repository**                        | No committed `reports/` — `.gitignore` excludes generated output.                                                                                                                                                                                                                      |

### PR runs (`pr-validation.yml`)

1. Resolves **story id** from `github.head_ref` (first `TOK-123` token).
2. Runs **`pnpm run test:unit:ci`** → Vitest default suite with JSON + JUnit under `reports/`.
3. Runs **`scripts/run-targeted-tests.sh`** on `docs/tests/<STORY>-targets.txt` when that file exists; full log in `reports/targeted-tests.log`.
4. Runs **`scripts/ci/write-test-result-summary.mjs`** → `reports/STORY_TEST_SUMMARY.md` with PR number, URL, ref, story id, per-test table, targeted log.
5. **Uploads artifact** named `test-results-pr-<PR#>-<STORY>`.

**Linear:** GitHub does not update Linear. Paste the **artifact** or **PR URL** into a Linear comment when reporting progress, or rely on the autonomous agent's `save_comment` / `save_issue` steps.

### Main runs (`ci.yml` — regression job)

On every **push to `main`** (`ci.yml`):

1. Same install / typecheck / lint / `test:unit:ci`.
2. **`scripts/ci/run-regression-story-targets.sh`** — runs **every** `docs/tests/TOK-*-targets.txt` file so all story-declared slices stay green together.
3. Summary → `reports/MAIN_REGRESSION_SUMMARY.md`.
4. Artifact **`regression-main-<sha>`**.
5. **Container job** (after regression): `docker build` from repo `Dockerfile`; optional push to Artifact Registry when GCP WIF secrets are configured (see root `README.md`).

## Promoting tests from a story loop into regression

**Facts:**

- Vitest already includes **`tests/**/\*.test.ts`**. Anything merged to `main` is part of the default regression suite on the next run.
- **Story targets** (`docs/tests/<id>-targets.txt`) are the **contract** for the implementer loop and PR validation for that branch.

**Convention (tier layout):**

| Directory     | Use                                                                      |
| ------------- | ------------------------------------------------------------------------ |
| `tests/unit/` | Fast, no network; handlers, pure logic, workflow shape tests.            |
| `tests/api/`  | HTTP/MCP contract, supertest-style, in-process server.                   |
| `tests/e2e/`  | Full connector flows (when allowed by test strategy — v1 may stay thin). |

**During a story:**

1. Test Architect / Implementer add failing tests under the right **`tests/<tier>/`** path.
2. List them in **`docs/tests/<STORY>-targets.txt`** (and optional prose in `docs/tests/<STORY>.md`).
3. Iterate until green; merge to `main`.

**After merge:** no extra "registration" step — `pnpm test` and `ci.yml` already pick up new files. Keep **`docs/tests/TOK-*-targets.txt`** updated so the **aggregated story-target regression** on `main` continues to run those paths explicitly (catches mis-filed globs).

## Release train (vision)

**Target behaviour** (not fully implemented in `.github/workflows/release.yml` yet):

1. **Promote** a `main` build to staging (image digest / revision).
2. **Run full regression** against that environment (or reuse artifact gates plus smoke URLs).
3. **On failure:** open a **fix PR** against `main` (automation/bot with `contents: write` + branch protection exceptions), re-run until green.
4. **On success:** tag release, promote to prod per `docs/environments.md`.

The checked-in **`release.yml`** is a **`workflow_dispatch` placeholder** until deploy credentials and bot permissions exist.

## Linear status not updating (S0.2 / TOK-7 class of bugs)

Linear is updated **only by the agent** via MCP (`save_issue`, `save_comment`), not by GitHub Actions.

**Common failure modes:**

1. **Wrong `state` string** — must match the team's workflow exactly (`In Progress`, `Done`, …). Call `list_issue_statuses { team: "Tokenomik" }` once per session if unsure.
2. **Autonomous marker / branch mismatch** — `linear-sync-prompt.sh` only nudges when `.cursor/autonomous-mode.txt`'s story id **equals** the branch token. Starting the marker before `git checkout -b TOK-7/...` leaves the hook silent.
3. **Skipped agent steps** — if the session ended before `save_issue`, nothing updates. The stop-hook **nudges** for unsynced **commits**, not for status transitions.
4. **Squash merge** — closing commit hash on the feature branch ≠ `main` tip; still update Linear using the **PR URL** and the merge outcome you observe in GitHub.

**Mitigation:** extend `/autonomous` close-out with an explicit checklist: `save_issue` → verify in Linear UI → `autonomous-stop.sh`.
