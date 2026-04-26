# AGENTS.md — Handoff for non-Cursor tools

This file is the plain-Markdown contract for any agent that opens this repo (Claude Code, Aider, OpenCode, Cline, GitHub Copilot, etc.). It mirrors the Cursor always-on rules under `.cursor/rules/` and points at the canonical documentation under `docs/`.

If you are running in Cursor, you can ignore this file — `.cursor/rules/00-index.mdc` and the rules it points to are loaded automatically. If you are not in Cursor, read this file and the linked docs before doing anything else.

---

## Project at a glance

- **Project:** `gdrive-cowork-connector` — a self-hosted remote MCP server + Cowork/Claude plugin that delivers reliable Google Drive access where Anthropic's bundled connector fails.
- **Brief:** [`docs/brief.md`](docs/brief.md)
- **PRD:** [`docs/prd.md`](docs/prd.md)
- **Architecture:** [`docs/architecture.md`](docs/architecture.md)
- **Tech stack:** [`docs/tech-stack.md`](docs/tech-stack.md)
- **UX principles & flows:** [`docs/ux-principles.md`](docs/ux-principles.md), [`docs/ux.md`](docs/ux.md)

## Constitution (must hold for every change)

Source: [`docs/constitution.md`](docs/constitution.md). Summary:

- Per-user OAuth, never service accounts. `drive.file` is the default scope.
- Per-session token isolation; refresh tokens encrypted at rest (AES-256-GCM).
- Implement MCP exactly as specified (Streamable HTTP, OAuth 2.0 + PKCE, DCR/CIMD).
- Drive content is untrusted input; destructive ops require `destructiveHint: true`.
- No credentials, tokens, codes, or refresh-token material in logs — ever.
- Specs and designs live in `docs/`; code without a spec is not a feature.
- Definition of Done: spec → targeted tests → implementation → review → diary (if significant) → Linear closure.

## Tech stack constraints

Source: [`docs/tech-stack.md`](docs/tech-stack.md).

- Node 22 LTS, TypeScript 5.x, ESM only.
- Hono + `@hono/node-server` for HTTP; `@modelcontextprotocol/sdk` for MCP.
- `googleapis` + `google-auth-library` for Drive v3.
- Sessions in Redis (Memorystore) for staging/prod; in-memory only for dev.
- `pino` JSON logs with redaction; optional Sentry.
- Vitest for unit/contract/integration. **No Playwright / UI tooling in v1.**
- ESLint + Prettier + vibecop. CI enforces all three.
- GitHub Actions; Cloud Run is the default deployment target.

## Test discipline

Source: [`docs/test-strategy.md`](docs/test-strategy.md) and [`docs/testing-artifacts-and-regression.md`](docs/testing-artifacts-and-regression.md).

- Every story carries `docs/tests/<story-id>-targets.txt`.
- `scripts/run-targeted-tests.sh <targets-file>` runs that subset and exits non-zero on any failure.
- The `verify-completion-promise` hook is the only path to `STORY_COMPLETE`. Do not fake it.
- Mandatory regression tests live forever: `tools.list.returns_full_set_after_oauth`, `tools.list.never_empty_post_init`, `oauth.refresh.silent_success`.
- **CI artifacts:** PR runs upload `STORY_TEST_SUMMARY.md` (+ Vitest JSON/JUnit); every push to `main` uploads `MAIN_REGRESSION_SUMMARY.md` via `ci.yml` and builds/pushes the container when GCP secrets exist. Download from the Actions run’s **Artifacts**. Layout: [`tests/README.md`](tests/README.md).

## Workflow & loop

This repo follows the BMAD-style autonomous SWE kit at [`docs/autonomous-swe-kit/autonomous-swe-design.md`](docs/autonomous-swe-kit/autonomous-swe-design.md).

- **First-run / onboarding:** [`docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding/workflow.md`](docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding/workflow.md). In Cursor, this is `/project-onboard`. Outside Cursor, follow the workflow file step by step, loading each persona from `docs/autonomous-swe-kit/agents/<name>.md`.
- **Per-story loop:** Planner (Plan) writes a design doc → Test Architect (Tess) selects targeted tests → Implementer (Imp) iterates Ralph-style until targeted tests pass → Reviewer (Rev) signs off → Linear story closed.

## Personas

| Persona           | Nickname      | Loaded from                                                                    | Role                                                 |
| ----------------- | ------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Analyst           | Mara          | `docs/autonomous-swe-kit/agents/analyst.md` (or `.cursor/commands/analyst.md`) | Brief                                                |
| Architect         | Artemis / Arc | `…/architect.md`                                                               | PRD, architecture, tech-stack                        |
| Platform Engineer | Plat          | `…/platform-engineer.md`                                                       | Environments, CI/CD, observability                   |
| Test Architect    | Tess          | `…/test-architect.md`                                                          | Test strategy + per-story targets                    |
| Planner           | Plan          | `…/planner.md`                                                                 | Per-story design doc (read-only)                     |
| Implementer       | Imp           | `…/implementer.md`                                                             | Code + unit tests + commits                          |
| Reviewer          | Rev           | `…/reviewer.md`                                                                | PR review                                            |
| UX Engineer       | Ume           | `…/ux-engineer.md`                                                             | UX principles, flows; design system if/when UI lands |

## Diary discipline

Source: `docs/diary/` and `.cursor/hooks/diary-append.sh`.

- The diary records **end-of-session/workflow summaries** and **significant decisions or updates to foundational documents** (brief, architecture, tech-stack, UX, constitution, backlog, story design docs).
- Routine tool calls and shell activity do **not** go in the diary. If you find yourself appending an entry per tool call, stop — the hook is intentionally throttled.
- **Parallel branches:** `.gitattributes` sets `merge=union` for `docs/diary/**` and `docs/agent-audit/agent-audit.jsonl` so append-only narrative merges cleanly into `main` (see `docs/agent-audit/README.md`).

## Linear

- Team: `Tokenomik`.
- Project: per-repo (this repo's project is named `gdrive-cowork-connector`).
- Epics and stories mirror [`docs/backlog.md`](docs/backlog.md). Epic 0 is mandatory and must be Done before any feature epic begins.

## Hooks (Cursor-specific, but informative)

`.cursor/hooks.json` registers:

- `block-dangerous` — refuses obviously destructive shell commands.
- `enforce-plan-mode` — design-before-code on story branches.
- `enforce-tokens` — token hygiene on commit.
- `vibecop-lint` — formatter on write.
- `diary-append` — throttled, end-of-session/significant-decisions only.
- `verify-completion-promise` — runs `scripts/run-targeted-tests.sh` for the current story; only emits `STORY_COMPLETE` when targeted tests are green.

If you are running outside Cursor, you are responsible for the equivalent discipline manually.

## What to do first

1. Read [`docs/constitution.md`](docs/constitution.md), [`docs/architecture.md`](docs/architecture.md), [`docs/tech-stack.md`](docs/tech-stack.md), and [`docs/backlog.md`](docs/backlog.md).
2. Pick a story (`S0.x` for foundation, `S1.x+` for features once Epic 0 is Done).
3. Run the per-story loop. Do not start implementation without a design doc and a targets file.
