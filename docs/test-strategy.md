---
title: Test Strategy — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## Test pyramid

| Tier                      | Tooling                                                             | When                              | Coverage target                                                                           |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Unit                      | **Vitest**                                                          | every push, every PR              | ≥ 80% lines on changed files; ≥ 70% project-wide                                          |
| Contract / protocol       | **Vitest** + MCP SDK in-process client                              | every PR (targeted), nightly full | every MCP method (`initialize`, `tools/list`, `tools/call`) and every tool's input schema |
| Integration               | **Vitest** + Drive API stubs (`nock` or `msw`)                      | every PR (targeted)               | each tool → Drive endpoint mapping                                                        |
| Live integration (canary) | **Vitest** + real Drive API on a dedicated test Workspace           | nightly + pre-release             | top 5 tools end-to-end                                                                    |
| End-to-end (connector)    | **MCP Inspector** + ngrok/Cloudflare Tunnel + manual prompt scripts | per release                       | OAuth flow, search→read→create flow                                                       |
| Security                  | `npm audit --omit=dev`, `gitleaks`, `trivy`                         | every PR + weekly                 | no high/critical unwaived                                                                 |

There is no UI surface in v1, so Playwright / visual regression is **out of scope**. If a UI ships in v2, append the relevant Playwright + visual baseline tier here.

## Targeted-test discipline

- Each story declares its impacted test targets in `docs/tests/<story-id>-targets.txt`. The file lists test file globs, one per line.
- The `verify-completion-promise` hook is the only way for the implementer to claim `STORY_COMPLETE`. The hook runs `scripts/run-targeted-tests.sh` against the story's targets file and only emits the completion promise when every target is green.
- Targeted tests are a **subset** of CI's full suite; they are what the implementer iterates against locally and in `pre-merge` checks. The PR-validation workflow runs them first and fails fast.

## CI tiering

Mirrors `docs/environments.md` CI/CD section:

- **PR validation** (`pr-validation.yml`): lint + typecheck + unit + targeted + markdown lint. Required for merge.
- **Main CI** (`ci.yml`): full unit + integration + container build + staging deploy + staging smoke.
- **Release** (`release.yml`): prod promotion + prod smoke.
- **Nightly** (`nightly.yml`, optional): live-integration canary against a test Workspace; on failure it opens a Linear issue.
- **Security** (`security.yml`): dependency / secret / container scans on PR and weekly.

## Quality gates

A change merges only when:

1. PR validation is green.
2. All targeted tests for the story pass.
3. Reviewer (Rev) sign-off recorded on the PR.
4. No new high/critical security findings.
5. If the change touches OAuth, redaction config, or the tool registry, an additional explicit reviewer ack is required (codeowner-style enforcement).

## Test data & isolation

- A dedicated GCP test project hosts the test OAuth client and the test Google Workspace.
- Live-integration tests use a dedicated test user; never a developer's personal account.
- Integration stubs (`msw`/`nock`) are the default; live-integration is opt-in via `TEST_LIVE_DRIVE=1`.

## Failure-mode coverage (mandatory)

The original first-party-connector failure mode (connected, no tools) drives mandatory tests:

- `tools.list.returns_full_set_after_oauth` — explicit test that immediately after OAuth, `tools/list` returns all advertised tools.
- `tools.list.never_empty_post_init` — chaos test: induce stale session, ensure `tools/list` either returns a 401 challenge or the full set, never `[]`.
- `oauth.refresh.silent_success` — refresh after access-token expiry does not surface as a user error.

These are first-class stories in Epic 0 and are run on every PR, not nightly.

## Coverage reports

- Vitest coverage as `lcov` + HTML, uploaded as a CI artifact and published to a coverage view (Codecov optional).
- Coverage regression on changed files blocks merge; project-wide regression warns but does not block.
