# Test run log (append-only)

This repo maintains an **append-only** log of CI test runs so you can trace:

- which **story** (Linear id) a run belonged to
- which **tests** ran (grouped by tier)
- the run **status**
- links to the **PR** and **GitHub Actions** run/job that produced the results

The source of truth is JSON Lines (JSONL).

## Files

- `docs/test-runs/test-runs.jsonl`: append-only list of test run records
- `reports/test-run-record.json`: per-run record generated in CI before append (uploaded as artifact)

## Schema: `TestRunRecord` (one JSON object per line)

```json
{
  "schema": "gdrive.testRunRecord.v1",
  "timestamp": "2026-04-26T00:17:32.123Z",
  "event": "pull_request",
  "storyId": "TOK-9",
  "links": {
    "linearIssue": "https://linear.app/tokenomik/issue/TOK-9",
    "designDoc": "docs/designs/TOK-9.md",
    "targetsFile": "docs/tests/TOK-9-targets.txt",
    "pullRequest": "https://github.com/ORG/REPO/pull/3",
    "actionsRun": "https://github.com/ORG/REPO/actions/runs/123456789",
    "actionsJob": "validate"
  },
  "git": {
    "repository": "ORG/REPO",
    "ref": "TOK-9/s04-secrets-config",
    "sha": "0123456789abcdef..."
  },
  "acceptanceCriteria": {
    "source": "linear",
    "url": "https://linear.app/tokenomik/issue/TOK-9",
    "items": [
      {
        "id": "AC1",
        "text": "…",
        "fragment": "…"
      }
    ]
  },
  "tiers": {
    "unit": [
      {
        "id": "tests/unit/server.test.ts::returns 200 on /healthz",
        "description": "returns 200 on /healthz",
        "type": "unit",
        "status": "passed"
      }
    ],
    "targeted": [
      {
        "id": "target:unit:tests/unit/server.test.ts",
        "description": "tests/unit/server.test.ts",
        "type": "unit",
        "status": "passed"
      }
    ],
    "api": [],
    "component": [],
    "e2e": [],
    "visual": [],
    "ux-flow": [],
    "custom": []
  }
}
```

### Notes

- `tiers.unit` is derived from `reports/vitest-unit.json`.
- `tiers.targeted` is derived from the story targets file (`docs/tests/<STORY>-targets.txt`).
- `acceptanceCriteria` prefers Linear description fragments when provided (optional env/file), otherwise falls back to AC bullets extracted from `docs/backlog.md` using the story code (e.g. `S0.4`) inferred from the story design frontmatter.
- Empty tiers exist so tooling can rely on a stable shape even before those runners are introduced.

## How it’s generated

- `scripts/ci/write-test-result-summary.mjs` writes:
  - `reports/STORY_TEST_SUMMARY.md` or `reports/MAIN_REGRESSION_SUMMARY.md`
  - `reports/test-run-record.json`
- `scripts/ci/append-test-run-log.mjs` appends the JSON record to:
  - `docs/test-runs/test-runs.jsonl` (idempotent by `(sha, runId, job)`)
