# CLAUDE.md — Autonomous SWE Kit

This file governs all Claude Code agent behaviour for this project. Read it completely before taking any action.

---

## Project identity

- **Config:** `docs/config.yaml` — load this first. It contains `project_root`, `project_name`, `pm_path`, `ide_path`, and all path configuration.
- **Constitution:** `docs/constitution.md` — non-negotiable rules. Read before every task.
- **Tech stack:** `docs/tech-stack.md` — pinned versions, forbidden APIs.
- **Architecture:** `docs/architecture.md` — system design, ADRs, NFRs.
- **Domain context:** `docs/domain-context.md` — canonical terminology and data/domain concepts when present.
- **Codebase design review:** `docs/codebase-design-review.md` — high-level design/refactor candidates when present.

## Path resolution

All workflow, command, hook, and documentation paths are relative to the installed project root from `docs/config.yaml` → `project_root`, unless explicitly absolute. If `project_root` is missing in an older install, use the nearest ancestor containing `docs/config.yaml`. Before shell commands that touch files, `cd` to that root or prefix paths with it.

---

## Sub-agents

This project uses a multi-agent architecture. Each agent has a dedicated file in `.claude/agents/`:

| Agent | File | Purpose |
|-------|------|---------|
| Implementer (Imp) | `.claude/agents/implementer.md` | Orchestrates the autonomous build loop |
| Analyst (Mara) | `.claude/agents/analyst.md` | Project brief |
| Architect (Artemis) | `.claude/agents/architect.md` | Architecture, PRD, tech stack |
| Specification Reviewer (Sera) | `.claude/agents/specification-reviewer.md` | Pass 2 spec review and simplification |
| UX Engineer (Ume) | `.claude/agents/ux-engineer.md` | Design system, UX direction |
| Platform Engineer (Plat) | `.claude/agents/platform-engineer.md` | CI/CD, environments, IaC |
| Test Architect (Tess) | `.claude/agents/test-architect.md` | Test strategy, per-story tests |
| Planner (Plan) | `.claude/agents/planner.md` | Per-story design docs |
| Coder (Cody) | `.claude/agents/coder.md` | Implementation code |
| Reviewer (Rev) | `.claude/agents/reviewer.md` | PR review |
| Auto-SWE-Advisor (Sage) | `.claude/agents/auto-swe-advisor.md` | Diagnostics and repair |
| Checker (Chex) | `.claude/agents/checker.md` | **Haiku-tier executor for routine reads/greps/status checks — delegate here from Imp/Cody/Rev to save tokens** |

When a workflow instructs you to "invoke" an agent, spawn the corresponding sub-agent file.

Each agent's frontmatter pins `model:` (haiku/sonnet/opus) and `effort:` per `docs/model-policy.md`. Claude Code reads these per-subagent. To change the policy: edit `docs/model-policy.md`, then run `scripts/apply-model-policy.sh`.

**Right-sizing rule:** Sonnet- and Opus-tier agents should delegate routine reads/greps/status to the **runner** (Haiku) subagent. See `.cursor/rules/46-model-rightsizing.mdc`.

---

## Available commands

| Command | Action |
|---------|--------|
| `/methodology-bootstrap` | Greenfield chain: HLD → specs → backlog → foundation |
| `/high-level-design` | Interactive HLD from seed docs |
| `/create-specifications` | Pass 1 draft (Opus) → Pass 2 review (Sera) → spec graph |
| `/project-onboarding` | Epics and stories from specifications |
| `/project-onboard` | **Deprecated** — use methodology-bootstrap |
| `/brownfield-onboard` | Onboard an EXISTING repo — gap analysis + remediation |
| `/grill-me-to-define` | Refine domain terminology and ADRs (grill-me-with-docs skill) |
| `/improve-codebase-design` | Review high-level design, spec drift, and technical debt |
| `/initial-solutioning` | **Deprecated** |
| `/project-impl-plan` | Generate epic and story files |
| `/foundation-cicd` | Set up CI/CD, environments, Epic 0 |
| `/autonomous <id>` | Autonomous build |
| `/release <env>` | Create release, run CI, deploy |
| `/reskin <preset-code>` | shadcn Preset reskin |
| `/swe-advisor [args]` | Diagnose and fix kit issues |

Workflow files live in: `docs/autonomous-swe-kit/workflows/` under `project_root`.

---

## Absolute rules (no exceptions)

1. **Read `docs/constitution.md` before any code task.**
2. **Never push to `main` directly - including docs-only and status-only commits.**
   All changes via PRs from feature branches. This covers the `mark-done` step: it
   writes story frontmatter and regenerates `_implementation_status.md`, which is a
   `merge=union` file that concurrent agents write. A direct push bypasses the only
   place that collision would surface. "It is only bookkeeping" is the judgement of
   the agent that wants to skip the step, and it has been wrong before.
3. **Never run destructive commands** (`rm -rf /`, `git push --force origin main`, `DROP TABLE`).
4. **Follow the behavior-slice TDD loop.** Tess defines test architecture; Cody adds one behavior test at a time, proves red, implements minimal green, then repeats.
5. **Never invent design tokens** not present in `tokens/` or `docs/design-system.md`.
6. **Never use raw UI values** in component code: no hex, rgb(), px, raw Tailwind colors, or arbitrary values such as `text-[14px]`.
7. **Never skip the gate — and run it once per epic, not once per story.** Stories run in sequence on the epic's branch, each ending green on its own progression tests. The gate runs when the last story is done, before the epic's single PR. If it is red, fix it — do not bypass. A story is done when its progression tests pass, not when regression does.
8. **Always write Memori session summaries.** Put durable outcomes in `.cursor/session-summary.md`; the Memori hook records them on Stop.
9. **Always update `project/implementation/_implementation_status.md`** when story status changes.
10. **Answer the question asked, and stop.** Match response length to the question: a yes/no question gets a yes or a no, a request for a value gets the value. Do not append caveats, context, timelines, tables, or "one thing worth flagging" unless the extra information is essential — meaning its absence would cause a wrong decision or a broken action. Do not spend tool calls verifying facts the question did not ask about. Volunteer detail only when asked, or when staying silent would mislead.
11. **Do only what was asked.** Fix the named defect, not adjacent ones you notice on the way. Do not refactor, rename, tidy, or "improve" anything the task did not name. Do not start follow-on work because it seems obvious. If you find other problems, list them in one line at the end and stop. When an instruction conflicts with your judgement, follow the instruction and say so in one sentence — do not quietly do it your way, and do not re-argue a decision already made.
12. **Never attach a live filter to a long-running command.** No `| grep`, `| head`, `| tail -f`, `--line-buffered` on anything slower than a few seconds (test suites, gates, builds, docker, dev servers), and no `tail -f` on a log you are waiting for. Run it as `scripts/run-logged.sh -- <command>` and read the log it writes under `reports/logs/`. When the tool call times out the harness terminates the shell without a signal, and the filter is left alive on a dead pipe: fifteen of them held 3,000 CPU-seconds on one workstation before anyone noticed. `scripts/reap-test-hygiene.cjs` reaps them now, but only after the fact.
13. **Never read a large file whole.** Anything over ~50KB - `docs/epics.md`, a domain design, `DEFECTS.md`, a generated target list, anything in `reports/logs/` - is read with `Grep`, or `Read` with offset and limit, or `--show`/`--tail` for a log. A 158KB read is roughly 40k tokens: three of them exhaust the window, and the first signal is a compaction, after which you no longer remember reading the file and read it again. Re-reads are what compaction does to a stateless reader, so the rule has to hold before the cost is visible.

---

## Running tests

Anything slower than a few seconds runs through the logger, never a live pipe (rule 12):
```bash
scripts/run-logged.sh --name e2e --timeout 900 --show 'passed|failed|Error' -- npm run test:e2e
```
The log lands in `reports/logs/<name>-<timestamp>.log`. `--show` prints matching lines *after* the command exits; `--tail` (default 30) prints the end of the log; the exit status is the command's own.


---

## Story implementation sequence

Every story follows this exact order:

```
PER EPIC — once, at the start:
1. git checkout main && git pull
2. git checkout -b feature/<epic-id>-<slug>

PER STORY — repeat for every story in the epic, on that one branch:
3. Update _implementation_status.md → in-progress
4. test-architect → test architecture + behavior slice plan
5. planner → docs/designs/<story-id>.md
5b. **Spec exit gate** → `bash tools/check-story-artifacts.sh --phase spec` MUST be green before coding. It checks the design (step 5) and test plan (step 4) exist. A story coded without them is built on an unspecified change (DF-BUG-6); do not skip to step 6 until this passes.
6. coder → tracer bullet, then one red-green behavior slice at a time until STORY_COMPLETE (max 25 iterations). **Cody commits each slice** — the TDD cycle log in step 9 is built from those commits.
7. confirm post-green refactor review
8. cat docs/tests/<story-id>-targets.txt >> tests/regression/regression-targets.txt
9. complete story test report with TDD cycle log + progression/regression evidence
10. **The story is already committed** — its slices landed as commits in step 6. This step is the completion marker, not a new commit: the story is done when its PROGRESSION tests are green. No gate, no PR, no merge between stories. (If step 6 left anything uncommitted — a stray refactor — commit it now; do not re-commit work Cody already committed.)
11. Update _implementation_status.md → done, and start the next story at step 3

PER EPIC — once, after the last story:
12. node scripts/local-ci-gate.cjs → MUST be green (the merge gate, run once over the whole epic)
13. git push && gh pr create   ← one PR, for the epic
14. [github_ci_phase: active only] Wait for PR CI → fix if red (max 5 attempts). Deferred: skip — Actions idle
15. gh pr merge --squash --delete-branch
16. [github_ci_phase: active only] Wait for main regression CI → fix if red (max 3 attempts). Deferred: skip — covered by the local gate
17. Update the epic's status → done
```

GitHub Actions are deferred (`github_ci_phase: deferred`, the default) through the whole app-build phase — every story merges on the **local CI gate**. The `[active only]` steps run once `scripts/ci-phase.cjs active` is flipped at go-live (IaC / staging+production). See `.cursor/rules/51-ci-economics.mdc`.

---

## Running tests

Per-story targeted tests:
```bash
./scripts/run-targeted-tests.sh docs/tests/<story-id>-targets.txt
```

Full regression suite:
```bash
./scripts/run-targeted-tests.sh tests/regression/regression-targets.txt
```

---

## Branch naming

- Feature branches: `feature/<story-id>-<slug>` (e.g. `feature/E2-S3-user-auth`)
- Fix branches: `fix/<description>` (e.g. `fix/E2-S3-regression-auth-token`)
- Release branches: `release/<env>/<YYYY-MM-DD>-<n>` (e.g. `release/production/2026-04-26-1`)

---

## Linear integration (if pm_path: linear)

Linear API token is set via `LINEAR_API_TOKEN` environment variable.
Team identifier is in `docs/config.yaml` → `linear_team`.

Story status mapping:
- `ready-for-dev` → Backlog / Todo
- `in-progress` → In Progress
- `done` → Done
- `blocked` → Blocked (with comment explaining the blocker)

---

## Memory and context

This project uses the kit memory stack:
- Graphify for full-codebase orientation before Grep/Glob.
- Serena MCP for LSP-backed symbol navigation and edits.
- Memori BYODB for coding/session history in your own database.
- context-mode for MCP context bloat reduction. Use `ctx_execute`, `ctx_index`, `ctx_search`, and `ctx_fetch_and_index` for large reads, logs, diffs, web payloads, and MCP outputs.

**Memory bootstrap is mandatory at the start of every task.** See rule `43-memory-start.mdc` for the exact sequence.

Claude Code has a Graphify `PreToolUse` hook for `Grep|Glob`. Use Serena tools before text surgery, and write `.cursor/session-summary.md` when a durable handoff is needed.
Run `ctx stats` after long sessions and `ctx doctor` if context-mode routing appears inactive.

---

## Getting help

If the autonomous loop is misbehaving:
```
claude /swe-advisor
```

The Auto-SWE-Advisor (Sage) reviews logs and configuration to diagnose and fix the issue.
