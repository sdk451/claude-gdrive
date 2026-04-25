# Test layout

Vitest picks up **`tests/**/\*.test.ts`** (see `vitest.config.ts`). Organise by tier:

| Directory         | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| **`tests/unit/`** | Fast tests: pure logic, workflow YAML shape, `app.fetch` without network. |
| **`tests/api/`**  | Contract tests: MCP/HTTP handlers, in-process servers, stubbed Drive.     |
| **`tests/e2e/`**  | Full flows (MCP Inspector / tunnel-backed) when the test strategy allows. |

**Story work:** the Test Architect lists paths in `docs/tests/<Linear-id>-targets.txt` (e.g. `docs/tests/TOK-8-targets.txt`). The implementer runs `scripts/run-targeted-tests.sh` against that file until green.

**After merge:** those files live on `main` and run in **every** `pnpm test` / `ci-main` regression. Update the targets file when you add or rename tests so PR + main aggregated runs stay aligned.

See also `docs/test-strategy.md` and `docs/testing-artifacts-and-regression.md`.
