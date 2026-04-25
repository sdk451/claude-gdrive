# gdrive-cowork-connector

Self-hosted remote MCP server plus Cowork/Claude plugin for reliable Google Drive access where Anthropic's bundled connector fails.

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm lint:md
pnpm test
pnpm dev
```

See [`AGENTS.md`](AGENTS.md) and [`docs/`](docs/) for architecture, constitution, and workflow.

## CI — required status checks

Pull requests to `main` run [`.github/workflows/pr-validation.yml`](.github/workflows/pr-validation.yml). The job is named **`validate`**.

In GitHub: **Settings → Branches → Branch protection rules** for `main`, enable **Require status checks to pass before merging** and select:

- **`validate`** (workflow _pr-validation_)

Until this rule is enabled, merges are not gated by CI in the GitHub UI; the workflow still runs on every PR.

## CI — viewing test results (PR + main)

Each **PR** workflow uploads an artifact named like `test-results-pr-<PR#>-<STORY>` containing:

- `STORY_TEST_SUMMARY.md` — human-readable table (PR, branch, resolved story id, each Vitest case, targeted runner log)
- `vitest-unit.json` / `vitest-unit-junit.xml` — machine-readable outputs

Each push to **`main`** runs [`.github/workflows/ci-main.yml`](.github/workflows/ci-main.yml) and uploads `regression-main-<sha>` with `MAIN_REGRESSION_SUMMARY.md` plus aggregated `regression-story-targets.log`.

See [`docs/test-strategy.md`](docs/test-strategy.md) and [`docs/testing-artifacts-and-regression.md`](docs/testing-artifacts-and-regression.md).

## License

UNLICENSED (private).
