# Autonomous Software Engineering Workflow — Detailed Design

**Scope:** A production-grade autonomous engineering workflow that takes defined inputs (project brief, PRD, architecture, tech stack, UX) and drives them to working, tested, deployed software with minimal human intervention — addressing the specific shortcomings of the current BMAD + Cursor + vibecop + mempalace setup.

**Platform target:** Cursor 3 as the primary host, with Claude Code as a complementary CLI for headless overnight runs. Rationale is in §2.

---

## 1. Executive Summary

The design is a four-layer system:

1. **Ideation & Specification** — kept largely as-is from BMAD, which is genuinely good at this.
2. **Foundation (Epic 0)** — a new, first-class phase that builds the path to production, CI/CD, environments, and the test architecture *before* any feature code is written.
3. **Autonomous Implementation Loop** — a tightly scoped per-story cycle: `Plan → Design → Test-First → Implement → Verify → Review → PR`, run by isolated agents in git worktrees.
4. **Multi-Tier Verification** — unit / API / component / E2E / UX flow, with explicit coverage gates and a smart test-selection policy so the right subset runs on each change.

The persona set collapses from BMAD's ~8–10 roles to **7 purpose-built agents**: Analyst, Architect, Platform Engineer, Test Architect, Planner, Implementer, Reviewer. Of these, the Platform Engineer and Test Architect are new (they close the Epic 0 and testing gaps), the Planner is new (it forces design-before-code), and the rest are consolidated BMAD roles.

Control is enforced at three levels: **Rules** (always-on soft guardrails in `.cursor/rules/`), **Hooks** (hard guardrails that run deterministic scripts at lifecycle events), and **Branching** (worktree-per-story isolation with Linear-driven kanban and PR-gated integration).

---

## 2. Platform Landscape (2026) — Comparison and Recommendation

The autonomous coding space has matured rapidly. As of April 2026, three platforms are serious options:

### Cursor 3 (April 2026)

- **Agent-first workspace.** The IDE is now treated as a fallback; the primary surface is a sidebar of local and cloud agents. Internal Cursor data shows 2× more users running agents than tab completion, and 35% of Cursor's own merged PRs are written by autonomous cloud agents.
- **Up to 8 parallel agents per prompt**, each in its own git worktree or remote VM, eliminating file conflicts.
- **Plan / Build separation.** You can plan with one model (typically a frontier reasoning model) and build with another (the faster Composer 2), or run parallel planning agents and pick the best plan.
- **Automations** — always-on agents triggered by commits, Slack messages, Linear updates, cron, or CI events. Handles ongoing chores like review, security audits, weekly summaries.
- **Native Linear/GitHub/Slack surfacing** — all running agents across all sources appear in one sidebar.
- **Shared rules, commands, prompts** across teams via the team rules feature.
- **Browser for Agent (GA)** for E2E validation; sandboxed terminals; multi-repo layout.
- **Composer 2** is Cursor's own model, roughly 4× faster than similarly-capable models, tuned for agentic loops.

### Claude Code (Q1 2026 state)

- **Subagents and Agent Teams** (research preview on Opus 4.6) — hierarchical multi-agent with git-based coordination, task claiming, continuous merging, automatic conflict resolution. Production users (Fountain, CRED) report 50–100% velocity improvements.
- **18-event hook system** — the deepest and most deterministic programmable control of any coding agent. Hooks enforce things rules can only suggest (CLAUDE.md compliance is ~70%; hooks are 100%).
- **Channels** — native multi-agent coordination primitive.
- **Remote Control + Dispatch** (Q1 2026) — makes Claude Code a viable headless backend. CI-triggered runs, cron jobs, webhook-driven fleets.
- **Ralph Loop plugin + `/loop`** — native support for iterative autonomous runs with completion-promise exit gating.
- **Skills architecture** — dynamically loaded knowledge modules that keep context lean.
- **Plugin marketplace** (wshobson/agents, Pensyve memory, Superpowers, Conductor, etc.) — a rich ecosystem without the weight of BMAD.

### Honorable mentions

- **Cline** — open-source, Plan/Act modes, Cline Kanban (multi-agent orchestration board, Claude Code / Codex / Gemini compatible, Linear MCP integration).
- **OpenAI Codex Web**, **GitHub Copilot Coding Agent**, **Jules (Google)** — cloud-VM tier; fire-and-forget, return to PR. Useful for overnight backlog drain.
- **GitHub Spec Kit** — spec-driven development toolkit (`/specify`, `/plan`, `/tasks`, `/implement`, `/analyze`). Agent-agnostic, works with Cursor, Claude Code, Copilot, Gemini, and 25+ others. Worth adopting as the *spec layer* over any chosen runtime.
- **Playwright Test Agents** (Planner / Generator / Healer) — the clear winner for autonomous E2E testing regardless of main platform.

### Recommendation

**Use Cursor 3 as the primary orchestrator; use Claude Code for headless overnight runs and for deep hook-based control; use Spec Kit as the specification layer; use Playwright Test Agents for E2E.**

Reasoning:

1. Cursor 3's agent-first interface solves the user's single biggest operational pain — "typing dev-story/code-review repeatedly" — because the workflow is now kanban-driven, not chat-driven. Linear integration is first-class.
2. Cursor's 8-parallel-agent worktree model directly addresses the multi-developer / multi-agent branching requirement.
3. Claude Code's hook system is materially more powerful than Cursor's; for hard guardrails (blocking dangerous commands, enforcing design-before-code, running verification loops) Claude Code called from Cursor via CLI is the right pattern. Cursor's shared-commands feature lets you wrap this cleanly.
4. Spec Kit is tool-agnostic — investing in specs gives you insurance against platform changes.
5. Picking Cursor doesn't lock out Claude Code; the two compose well. Many teams run both.

If you want to stay 100% Cursor, you can — Cursor 3 has all the primitives needed. The dual approach is recommended, not required.

---

## 3. Target Architecture — Four Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 1: IDEATION & SPECIFICATION  (mostly human-led, BMAD-style) │
│   brief.md → prd.md → architecture.md → tech-stack.md → ux.md    │
│   constitution.md (non-negotiables)                              │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 2: FOUNDATION / EPIC 0   (autonomous, one-time per project) │
│   Platform Engineer + Test Architect collaborate to produce:     │
│     • environments (dev/test/staging/prod) with IaC              │
│     • CI/CD pipeline (build, test, deploy gates)                 │
│     • test-strategy.md (pyramid, coverage targets, tooling)      │
│     • test harness scaffolding (unit/api/component/e2e/ux)       │
│     • observability baseline (logs, metrics, traces)             │
│     • .cursor/rules/ + hooks + AGENTS.md                         │
│   Gate: 'hello world' ships end-to-end through all envs          │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 3: AUTONOMOUS IMPLEMENTATION   (per epic, per story)        │
│   For each story in Linear backlog:                              │
│     1. Planner loads context → produces design.md                │
│     2. Test Architect produces story-tests.md (acceptance)       │
│     3. Implementer runs Ralph-style TDD loop until green         │
│     4. Reviewer runs quality checks, opens PR                    │
│     5. CI/CD runs full relevant suite (smart selection)          │
│     6. Human reviews + merges                                    │
│   Each story runs in its own git worktree (isolation)            │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ LAYER 4: MULTI-TIER VERIFICATION   (continuous)                   │
│   unit → api/integration → component → e2e → ux-flow             │
│   Coverage analysis agent expands tests post-implementation      │
│   Playwright Test Agents (Planner/Generator/Healer) run E2E      │
│   Smart test selection runs only affected tiers on each change   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Simplified Agent Persona Set

Down from BMAD's 8–10 personas to **seven**, each with sharp scope and a single primary artifact.

| # | Persona | Runs | Primary Output | Scope |
|---|---------|------|----------------|-------|
| 1 | **Analyst** (Mara) | Ideation phase | `brief.md` | Domain research, market scan, feasibility, problem statement |
| 2 | **Architect** (Arc) | Ideation phase | `prd.md`, `architecture.md`, `tech-stack.md`, `ux.md` | System design, tech choices, UX wireframes, epic/story decomposition |
| 3 | **Platform Engineer** (Plat) | Epic 0 + as-needed | `infra/`, `.github/workflows/`, `environments.md` | Dev/test/staging/prod environments, CI/CD, IaC, observability |
| 4 | **Test Architect** (Tess) | Epic 0 + per story | `test-strategy.md`, `story-tests.md`, test harness code | Test pyramid, coverage targets, tooling, per-story acceptance tests |
| 5 | **Planner** (Plan) | Per story | `design.md` for the story | Context loading, design-before-code, SOLID/DRY enforcement, pattern selection |
| 6 | **Implementer** (Imp) | Per story | Code + unit tests | Execute the plan via TDD loop, iterate until green |
| 7 | **Reviewer** (Rev) | Per story | PR comments, quality report | Multi-angle review (security, performance, accessibility, style), coverage check |

**What's gone from BMAD:** Scrum Master (absorbed into Linear automation), QA (split into Test Architect + Reviewer), Product Manager (merged into Architect — most BMAD PM work is really architecture when you strip out the ceremony), separate UX Designer (absorbed into Architect for initial design; Reviewer for accessibility). Party Mode and the quick-solo-dev flows are cut.

**Persona definition pattern** — each agent is defined as a Cursor shared command *or* a `.claude/agents/*.md` file:

```yaml
---
name: planner
description: Produces design.md for a story, leveraging existing architecture and patterns
tools: Read, Glob, Grep, Bash(git:*), Bash(linear:*)
disallowedTools: Write, Edit  # Planner cannot write code
model: opus
effort: high
permissionMode: plan
---

# Planner Agent

You are the Planner. Your sole output is `docs/designs/{story-id}.md`.

## Inputs you MUST load before writing
1. Story: @linear:{story-id}
2. Architecture: @docs/architecture.md
3. Tech stack: @docs/tech-stack.md
4. Existing design patterns: @docs/patterns/
5. Codebase neighborhood: use Grep/Glob to find related modules
6. Prior story designs: @docs/designs/ (last 3 stories in the same epic)

## Your output structure
- Problem statement (from story)
- Proposed design (with diagrams)
- Design patterns applied (named)
- SOLID/DRY impact analysis
- Interface contracts (APIs, types, events)
- Data model changes (if any)
- Files to create / modify / delete
- Risks & alternatives considered
- Test approach (delegate to Test Architect)

## Hard constraints
- Do NOT write implementation code
- Every choice must cite the architecture or tech-stack rationale
- If the story conflicts with architecture, STOP and flag it
```

The pattern is consistent across personas: tight scope, explicit inputs that must be loaded, explicit output format, tool restrictions that make the wrong behaviour impossible.

---

## 5. End-to-End Workflow

```
PHASE 1: IDEATION (human-led, hours-to-days, one-off)
  Human + Analyst    → brief.md
  Human + Architect  → prd.md, architecture.md, tech-stack.md, ux.md
  Human              → constitution.md (non-negotiables)
  Human              → Linear project with epics

PHASE 2: EPIC 0 — FOUNDATION (autonomous, hours, one-off)
  Platform Engineer  → environments (IaC), CI/CD pipeline
  Test Architect     → test-strategy.md, test harness, coverage config
  Gate: hello-world deploys to all envs with all test tiers running

PHASE 3: EPIC n STORIES (autonomous, minutes-to-hours, per story)
  Loop per story in backlog:
    Planner          → design.md
    Test Architect   → story-tests.md (acceptance tests, written first)
    Implementer      → code + unit tests (TDD Ralph loop)
    Reviewer         → PR with quality report
    CI/CD            → runs relevant test tiers
    Human            → reviews, merges

PHASE 4: HARDENING (autonomous, per epic)
  Test Architect     → coverage gap analysis
  Playwright Agents  → generate E2E coverage for UX flows
  Reviewer           → cross-story regression checks
  Gate: epic meets coverage targets, deploys to staging
```

Transition from Phase 1 to Phase 2 is a human decision. Transitions within Phase 3 are autonomous — Linear status is the source of truth, and Cursor Automations or a Claude Code `/loop` picks up the next "Ready" story automatically.

---

## 6. The Autonomous Story Loop — The Core Deliverable

This is the heart of the system and directly addresses the user's "can't build from my specs autonomously" problem. Each story runs in an isolated worktree through six stages.

### Stage 0 — Worktree provisioning (automated by Cursor 3 or a shell wrapper)

```bash
# Triggered when a Linear story moves to "Ready"
# (Cursor Automation, or a GitHub Action, or a cron-driven Claude Code run)
STORY_ID="AUTH-123"
git worktree add "../${REPO_NAME}.${STORY_ID}" -b "feature/${STORY_ID}"
cd "../${REPO_NAME}.${STORY_ID}"
./scripts/bootstrap-worktree.sh  # install deps, link env vars
cursor-agent --plan --story ${STORY_ID}  # or claude -p "/story ${STORY_ID}"
```

Cursor 3 does this natively when you ask it to run agents in parallel — it creates worktrees automatically and runs each agent in isolation.

### Stage 1 — Plan mode (Planner agent, READ-ONLY)

The Planner runs first in plan-only mode. It cannot write code. Its output is `docs/designs/{story-id}.md`. This is the key fix for "design is the missing element."

Inputs loaded, in order:
1. Story + acceptance criteria from Linear (via MCP)
2. Constitution (non-negotiable rules)
3. Architecture + tech stack
4. Existing design patterns catalogue (`docs/patterns/`)
5. Adjacent code (via Grep/Glob around the files the story touches)
6. The last 3 story designs in the same epic (for continuity)

Design doc must include: problem framing, proposed design with diagrams, SOLID/DRY impact, design patterns named and justified, interface contracts, data model deltas, file-level change list, alternatives considered, risks.

**Gate:** Human reviews `design.md` (optional but recommended early in adoption; can be skipped once trust is established by flipping a config flag).

### Stage 2 — Test plan (Test Architect agent)

Reads `design.md`. Produces `docs/tests/{story-id}.md` specifying, per layer:
- Unit tests (inputs, outputs, edge cases)
- API/integration tests (contract validation, error paths)
- Component tests (if UI-affecting)
- E2E acceptance tests (matching story acceptance criteria)

The Test Architect also drafts the *failing* test files using Playwright Test Agents' Planner for E2E, language-native unit frameworks for the rest. Tests must fail when first committed — this is the TDD signal.

### Stage 3 — TDD Ralph loop (Implementer agent)

This replaces the manual `dev-story [XXX]` / `code-review [XXX]` typing. It's a Ralph-style loop with a dual-condition exit gate: both a completion indicator *and* an explicit `<promise>STORY_COMPLETE</promise>` token.

```text
LOOP PROMPT (simplified):

Implement story {story-id}.
INPUTS:
  - design: docs/designs/{story-id}.md
  - tests:  docs/tests/{story-id}.md
  - constitution: docs/constitution.md

PROCEDURE:
  1. Read design + tests
  2. Confirm test files exist and currently FAIL
  3. Implement the minimum code to pass the smallest failing test
  4. Run the relevant test tier; if red, debug and fix
  5. Refactor if the design calls for it (DRY/SOLID guidance in design.md)
  6. Repeat 3-5 until all tests for this story pass
  7. Run lint, type-check, format
  8. Commit with conventional-commits message
  9. Output <promise>STORY_COMPLETE</promise> when all criteria met

MAX ITERATIONS: 30
EXIT CONDITIONS:
  - all tests green AND <promise>STORY_COMPLETE</promise>
  - OR iterations exhausted (then: open PR as draft with BLOCKED status)
```

In Cursor this is a shared command (`/implement-story`); in Claude Code it's a `/ralph-loop` invocation with a crafted completion promise.

### Stage 4 — Review (Reviewer agent)

Reviewer runs automatically on the worktree's final commit. Produces a structured review in a Markdown file attached to the PR, with sections for:
- Security (auth, inputs, secrets, dependencies)
- Performance (obvious hotspots, N+1, unbounded loops)
- Accessibility (if UI)
- Code quality (SOLID/DRY vs design.md, naming, test quality)
- Architecture drift (does the change obey `architecture.md`?)
- Coverage delta

Any **critical** finding blocks the PR. This is enforced by a hook that fails the GitHub status check.

### Stage 5 — Pull Request

The worktree's final commit is pushed and a PR is opened (via `gh pr create` or the Linear MCP). The PR body links back to:
- The Linear story
- `design.md`
- `story-tests.md`
- The Reviewer report
- CI run results

### Stage 6 — CI/CD + human merge

CI runs the smart-selected test tiers (see §8). On green, the PR is ready for human review. On merge, the worktree is auto-removed and Linear status advances.

---

## 7. Epic 0 — Path to Production

This phase is what's missing from the current BMAD setup. It runs *once* per project, between Ideation and the first feature epic, and it's entirely autonomous after the Architect hands off.

### 7.1 Platform Engineer deliverables

1. **Environment definitions**
   - `infra/` tree with IaC (Terraform or Pulumi, tech-stack-dependent)
   - Four environments: `dev`, `test`, `staging`, `prod`, each in its own account/project
   - Secrets management (vault, SOPS, or cloud-native KMS — no secrets in repo)
   - Ephemeral preview environments per PR branch where feasible (Upsun, Vercel, Fly, or home-grown)

2. **CI/CD pipeline** (`.github/workflows/` or equivalent)
   - PR pipeline: lint → type-check → unit → api → component → E2E (on preview env)
   - Main pipeline: all of the above + deploy to staging
   - Release pipeline: staging → prod with manual approval gate
   - Security scans (SAST, SCA, secret scanning) on every PR

3. **Observability baseline**
   - Structured logging contract (which fields are always present)
   - Metrics endpoint + default dashboard
   - Distributed tracing (OpenTelemetry) wired through
   - Error tracking (Sentry or equivalent) with release tagging

4. **`.cursor/rules/`** (see §9) and `AGENTS.md` written from architecture + tech-stack

### 7.2 Test Architect deliverables

1. **`docs/test-strategy.md`** — the coherent testing approach that's currently missing
   - Pyramid shape (e.g., 70% unit, 20% integration/api, 8% component, 2% E2E)
   - Coverage targets per tier
   - Definition of "flaky" and how flakes are handled
   - Test data strategy (fixtures, factories, seeded DBs, no shared mutable state)
   - How tests are selected per change (smart selection; see §8)

2. **Test harness scaffolding**
   - Unit test runner configured (vitest/jest/pytest/go test)
   - API test harness (supertest/httpx/rest-assured against in-process or testcontainers DB)
   - Component test harness (React Testing Library, Vue Test Utils, etc.)
   - Playwright installed with init-agents for Planner/Generator/Healer
   - Coverage reporting (istanbul/coverage.py) wired into CI
   - Coverage dashboards published (Codecov or self-hosted)

3. **Reporting**
   - Test run reports emitted as JUnit XML + HTML
   - Coverage delta posted to PR comments
   - Flaky-test quarantine with auto-issues in Linear

### 7.3 Exit gate

Epic 0 is done when a trivial "hello-world" feature ships through the full pipeline: change in `dev` → PR → preview env tests → merge → staging deploy → manual promote → prod. Every test tier must actually execute. This proves the plumbing, not the product.

---

## 8. Testing Strategy — Multi-Tier with Coherent Coverage

Addresses the "testing is always weak, usually not coherent" gap. Three principles:

1. **Every story gets tests at the appropriate tiers.** The Test Architect decides which tiers apply per story, not the Implementer.
2. **Coverage is a first-class output.** Analysis happens after implementation, not before.
3. **Test selection is smart.** You don't run the 20-minute E2E suite on every commit.

### 8.1 The five tiers

| Tier | Scope | Tool (example) | Runs on |
|------|-------|----------------|---------|
| Unit | Single function / class | vitest / jest / pytest | Every save (hook) + PR |
| API/Integration | Service boundary | supertest / httpx + testcontainers | PR |
| Component | Single UI component | RTL / Vue Test Utils | PR if UI changed |
| E2E | Full stack against preview env | Playwright (via Test Agents) | PR if E2E-affecting |
| UX Flow | Multi-page user journeys | Playwright + visual regression | Nightly + pre-release |

### 8.2 Post-implementation coverage expansion

After the Implementer completes a story, the Test Architect is invoked again in "coverage audit" mode:

```text
Inputs: changed files, existing tests, coverage report
Task:
  1. Identify uncovered branches in changed code
  2. Propose missing API tests for new endpoints
  3. Propose missing component tests for new/modified components
  4. Hand the highest-value gap to Playwright Generator for E2E
  5. Raise Linear issues for any gap below a threshold (configurable, e.g., "don't file issues for < 5 line uncovered blocks")
Output: coverage-report.md + new test files + follow-up Linear issues
```

This closes the "test coverage analysis to expand tests to api, e2e, and UI component, then e2e UX flows is always missing" gap directly.

### 8.3 Smart test selection

For fast feedback, the CI runs only affected tiers:

- Any change → unit tests for changed packages + direct dependencies (computed from import graph)
- API change → + API tests for changed routes
- Frontend component change → + component tests for changed files
- Route/page/UX-flow change → + E2E tests for affected flows
- Shared/core change → full suite

Tools: Nx affected, Turborepo, jest `--changedSince`, pytest-testmon, or a homegrown git-diff-to-suite mapper. The Platform Engineer picks the right tool during Epic 0 based on the tech stack.

### 8.4 Reporting

- JUnit XML → published to GitHub Checks + PR comments
- Coverage delta → PR comment with ▲/▼ per file
- Flaky test detection → over last 20 runs; flakes get auto-quarantined (skip + Linear issue)
- Weekly rollup → Cursor Automation posts a summary to Slack on Monday mornings (pass rate, coverage, flake list, newly quarantined)

### 8.5 Playwright Test Agents integration

Run on a schedule *and* reactively:

- **Planner** runs weekly, exploring new routes/pages and producing/updating `specs/*.md`
- **Generator** runs on PR if Planner output changed, producing/updating `tests/e2e/**`
- **Healer** runs after every E2E test failure, auto-patching selectors and waits; opens PR if a patch succeeds

This is a complete, autonomous E2E testing loop — no human writes Playwright code.

---

## 9. Hooks, Rules, and Branching — The Technical Enablers

### 9.1 Rules layer (soft guardrails, always-on)

Location: `.cursor/rules/*.mdc` (and/or `AGENTS.md` at repo root).

Structure:

```
.cursor/rules/
  01-constitution.mdc        # alwaysApply: true — non-negotiables
  02-architecture.mdc        # alwaysApply: true — architecture summary, ~1500 tokens max
  03-tech-stack.mdc          # alwaysApply: true — exact versions, forbidden APIs
  10-frontend.mdc            # globs: src/web/**/*.{ts,tsx,vue}
  11-backend.mdc             # globs: src/api/**/*.{py,ts,go}
  12-tests.mdc               # globs: tests/**/*, **/*.test.*, **/*.spec.*
  20-planner.mdc             # only applied when Planner agent is active
  21-implementer.mdc         # only applied when Implementer agent is active
  22-reviewer.mdc            # only applied when Reviewer agent is active
  99-personal.mdc            # gitignored, per-developer preferences
AGENTS.md                    # plain-markdown fallback for other tools
```

Key principles from the 2026 best-practice literature:

- **Total "always apply" content under 2000 tokens.** More than that and Cursor skims past the important parts. This is exactly the "overloading input token size ends up being detrimental" risk the user flagged.
- **Use strong language.** "NEVER use class components" beats "Prefer functional components." Agents respond to imperatives.
- **Scope with globs.** Frontend rules don't belong in Implementer backend context.
- **Periodic rule reinforcement.** Include a self-check instruction: "Re-check rules file every 10 messages." Long sessions drift.
- **Rules handle the 70% case; hooks handle the 30% that matters.**

### 9.2 Hooks layer (hard guardrails, deterministic)

This is where Claude Code pulls ahead of Cursor. Claude Code hooks close the 70%-compliance gap to 100%. If the workflow is Cursor-hosted, you can still call Claude Code as a subprocess for hook execution — or use Cursor's own hooks feature for equivalent coverage.

Hook taxonomy for this workflow:

| Event | Hook | Action |
|-------|------|--------|
| PreToolUse(Bash) | `block-dangerous.sh` | Blocks `rm -rf /`, force-push to main, unbounded loops |
| PreToolUse(Write\|Edit) | `enforce-plan-mode.sh` | If no `design.md` exists for current branch, refuse writes |
| PreToolUse(Write\|Edit) | `enforce-test-first.sh` | If new prod code file has no matching test file, refuse |
| PostToolUse(Write\|Edit) | `vibecop-lint.sh` | Runs vibecop (keep this!) + language linter + auto-format |
| PostToolUse(Write\|Edit) | `type-check-affected.sh` | Runs tsc/mypy/go vet on affected files only |
| PostToolUse(Write\|Edit) | `run-affected-unit-tests.sh` | Runs unit tests for touched packages |
| Stop | `verify-completion-promise.sh` | Blocks exit until `<promise>STORY_COMPLETE</promise>` is emitted AND tests green |
| PreCommit | `commit-message-lint.sh` | Enforces conventional commits referencing Linear ID |
| PrePushToMain | `block-direct-to-main.sh` | Hard block; everything goes through PR |

The `enforce-plan-mode.sh` hook is the concrete mechanism that solves "I would insist on entering /plan mode to implement each epic or story." It makes the wrong behaviour impossible.

### 9.3 Keep what works from current setup

- **vibecop** → runs as a PostToolUse hook (already does). Keep.
- **mempalace** → runs as a session-start + periodic skill, providing codebase context to each session. Keep. Consider complementing with Pensyve (Anthropic-official memory plugin) for cross-session agent-memory if you find mempalace alone is insufficient for long runs.
- **agents.md context loading** → restructured as the rules hierarchy above. The "don't overload" principle stays.

### 9.4 Branching & PR approach

Rules of the road:

1. **`main` is protected.** No direct pushes. All changes via PR. Enforced by hook + branch protection.
2. **One story = one branch = one worktree = one agent.** This scales cleanly from solo to team to multi-agent. Cursor 3 creates worktrees automatically when running parallel agents; `git worktree` works for manual runs.
3. **Branch naming** is derived from Linear: `feature/AUTH-123-short-slug`, `fix/BUG-456-…`, `chore/…`. A small CLI wrapper (`scripts/new-story.sh {story-id}`) fetches the story, creates the worktree, sets up env.
4. **Stacked PRs for dependent stories.** Tools: `spr`, Graphite, or GitHub's native stack. This matters when an epic has tightly coupled stories.
5. **Draft PRs early.** As soon as the Implementer makes its first commit, the PR is opened as draft. Keeps visibility high; lets human intervene before wasted compute.
6. **Auto-cleanup.** Merged branches and their worktrees are removed automatically by a GitHub Action + local Cursor Automation.

### 9.5 Linear integration (kanban)

- Linear is the source of truth for story state.
- MCP connection (Cursor 3 supports Linear natively; Claude Code via MCP server) lets agents read/write status.
- Statuses: `Backlog → Ready → In Design → In Test Plan → In Progress → In Review → Merged → Done`
- Transitions are triggered by hooks: design.md commit → `In Test Plan`; tests file commit → `In Progress`; PR open → `In Review`; merge → `Merged`; staging deploy → `Done`.
- Cursor Automations + Linear webhooks form the always-on loop: a new "Ready" story triggers worktree creation + Planner invocation.

---

## 10. Specification Layer — Use Spec Kit Over Raw Markdown

Rather than invent a new spec format, adopt GitHub's Spec Kit for the document set the Architect produces. Reasons:

- It's agent-agnostic (Cursor, Claude Code, Copilot, Cline all work).
- It has built-in commands: `/constitution`, `/specify`, `/clarify`, `/plan`, `/tasks`, `/analyze`, `/implement`.
- `/analyze` does cross-artifact consistency checking — it catches PRD-vs-architecture drift that BMAD currently misses.
- It encodes the discipline the user already values (spec-before-code), formalises it, and gives you the meta-tooling for free.

Mapping to BMAD's existing outputs:

| BMAD | Spec Kit |
|------|----------|
| `brief.md` | informs `/constitution` and `/specify` |
| `prd.md` | output of `/specify` + `/clarify` |
| `architecture.md` | output of `/plan` |
| Sprint stories | output of `/tasks` |
| Implementation | `/implement` (we replace this with our autonomous loop) |

Spec Kit's analysis command (`/speckit.analyze`) should be wired into CI as a nightly check on spec artifacts themselves — it catches spec drift early.

---

## 11. Migration Path from Current Setup

A six-week migration, keeping the parts that work:

**Week 1 — Foundations.** Stand up Epic 0 on one existing project. Implement `.cursor/rules/` hierarchy. Author the 7 persona definitions. Set up Spec Kit. Keep vibecop + mempalace running as today.

**Week 2 — Platform + Test Architect.** Drive Epic 0 through Platform Engineer (environments + CI/CD) and Test Architect (strategy + harness). Prove hello-world ships end to end.

**Week 3 — Planner + Implementer loop.** Run the first story end-to-end on one worktree with human inspection at each stage. Calibrate rules and hooks.

**Week 4 — Reviewer + CI integration.** Add Reviewer, smart test selection, coverage delta on PRs. Move from single-story manual to Linear-driven Ready-trigger.

**Week 5 — Parallelism + Playwright Agents.** Turn on 2-agent parallel execution. Enable Playwright Planner/Generator/Healer. Monitor.

**Week 6 — Overnight runs + retros.** Enable scheduled autonomous runs (Cursor Automations + Claude Code `/loop`). Run a retro against a baseline sprint done the old way. Tune rules, prompts, hooks based on what broke.

At the end of week 6, you have: Linear-driven autonomous engineering; seven sharp personas; Epic 0 plumbing; multi-tier testing with coverage; hook-enforced guardrails; parallel worktree execution; human-in-the-loop only at spec-approval and PR-merge gates.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Agents drift from architecture over long runs | High | High | Planner is blocked from code; rules include architecture summary; periodic reinforcement hook |
| Context bloat degrades output quality | High | Medium | Rules under 2000 tokens always-on; scoped rules via globs; skills loaded on demand; mempalace/Pensyve for memory |
| Parallel agents collide on shared files | Medium | Medium | Worktree isolation is strict; merge conflicts surface at PR, not runtime; pre-agent test baseline pattern |
| Flaky E2E tests erode trust | High | High | Playwright Healer auto-patches; flake quarantine with auto-issues; strict flake-rate SLO |
| Hook scripts accumulate tech debt | Medium | Medium | Hooks live in `scripts/hooks/`; reviewed like any code; unit-tested where non-trivial |
| Tests written to satisfy coverage, not intent | Medium | High | Test Architect writes tests *before* Implementer sees them; Reviewer verifies tests meaningfully fail when mutated |
| Model update breaks prompts | Medium | Medium | Pin model versions in persona definitions; have eval suite that runs on model upgrade |
| Cost runs away (Opus for everything) | High | Medium | Planner uses Opus-class; Implementer uses Composer 2 / Sonnet; Reviewer Sonnet; Haiku for simple searches; hard per-run budget cap |
| Agent writes "plausible but wrong" code in unfamiliar framework | Medium | High | Tech-stack rule is version-pinned; Context7 MCP for live docs; Reviewer runs framework-specific lints |
| Spec drift between PRD/architecture/code | Medium | High | `/speckit.analyze` nightly; Reviewer includes architecture-drift check |
| "Too autonomous" — agent ships something you didn't want | Low | Very high | Every story has optional human gate at design.md; PR merge is always human; constitution forbids irreversible ops without approval |

---

## 13. Implementation Roadmap (4 weeks to first autonomous story; 6 weeks to steady state)

**Days 1–3 — Tooling installation**
- Install Cursor 3, Claude Code, Spec Kit
- Configure Linear MCP on both
- Enable shared team rules in Cursor

**Days 4–7 — Authoring**
- Write `.cursor/rules/` hierarchy from existing project
- Write 7 persona definitions (as Cursor shared commands + `.claude/agents/*.md`)
- Write 5 core hooks: block-dangerous, enforce-plan-mode, vibecop-lint, type-check-affected, verify-completion-promise

**Days 8–14 — Epic 0 dry run**
- Drive Platform Engineer + Test Architect on a scratch project
- Ship hello-world through all environments
- Document the environment setup in `docs/environments.md`

**Days 15–21 — First real story**
- Pick a small, low-risk story from existing backlog
- Run Planner → human review → Test Architect → human review → Implementer → Reviewer → PR
- Collect every friction point; tune rules/hooks

**Days 22–28 — Steady state on one track**
- Drop the intermediate human gates
- Run 3–5 stories autonomously end-to-end
- Establish baseline metrics: lead time, cycle time, PR size, coverage delta, flake rate, review comments per PR

**Days 29–42 — Scale**
- Turn on 2-agent parallel execution via worktrees
- Enable Playwright Test Agents loop
- Turn on Cursor Automations for always-on picking up "Ready" stories
- Onboard a second engineer to the workflow
- Run a retro

---

## 14. Key Differences vs. Current Approach (Direct Mapping to Stated Gaps)

| Current gap | Fix in this design |
|-------------|-------------------|
| Can't build from specs autonomously | Linear "Ready" → Cursor Automation → Planner → … → PR. Fully automated. |
| Too many BMAD personas / workflows | 7 sharp personas, each with single primary output, tool restrictions enforced |
| Missing Epic 0 | First-class phase with explicit Platform Engineer + Test Architect deliverables and a hello-world exit gate |
| Dev loop weak; no /plan step | Planner runs read-only and must produce design.md; `enforce-plan-mode` hook blocks writes without it |
| Design step missing | Planner output is literally a design doc, citing patterns + architecture; blocked from writing code |
| Testing weak, coverage stops at unit | Test Architect owns strategy; five-tier pyramid; post-impl coverage expansion; Playwright Agents for E2E |
| No test reporting/coverage | JUnit XML, PR coverage deltas, flake quarantine, weekly Slack rollup |
| Can't do multi-developer/agent branching | Worktree-per-story + Linear-driven kanban; up to 8 parallel agents out of the box in Cursor 3 |

---

## Appendix A — Persona Definitions (one-file starter set)

Short-form starter versions of all seven personas, ready to drop into `.claude/agents/` or paste as Cursor shared commands. Full versions would be ~100 lines each; these are the one-screen MVPs.

```yaml
# .claude/agents/analyst.md
---
name: analyst
description: Drives discovery, domain research, and project brief
tools: Read, Glob, Grep, WebSearch, WebFetch
model: opus
effort: high
---
You are the Analyst. Output: docs/brief.md.
Follow BMAD-style Working Backwards. Ask at most 5 high-signal questions before writing.
```

```yaml
# .claude/agents/architect.md
---
name: architect
description: Produces PRD, architecture, tech stack, UX wireframes
tools: Read, Glob, Grep, WebSearch, Write(docs/**)
model: opus
effort: high
---
You are the Architect. Outputs: docs/prd.md, docs/architecture.md, docs/tech-stack.md, docs/ux/*.
Reference docs/brief.md. Produce epic + story decomposition in Linear-ready format.
```

```yaml
# .claude/agents/platform-engineer.md
---
name: platform-engineer
description: Builds Epic 0 — environments, CI/CD, IaC, observability
tools: Read, Write, Edit, Bash
model: opus
effort: high
---
You are the Platform Engineer. Deliver Epic 0 outputs listed in docs/test-strategy.md §7.1.
Hard rule: no feature work. Your exit gate is hello-world shipping to all 4 envs.
```

```yaml
# .claude/agents/test-architect.md
---
name: test-architect
description: Test strategy, per-story test plans, coverage expansion
tools: Read, Write, Edit, Bash, Grep
model: opus
effort: high
---
You are the Test Architect. In Epic 0, produce docs/test-strategy.md + harness.
Per story, produce docs/tests/{id}.md + FAILING test files before Implementer runs.
Post-implementation, audit coverage and expand at API/component/E2E tiers.
```

```yaml
# .claude/agents/planner.md
---
name: planner
description: Story-level design doc, always run first, READ-ONLY
tools: Read, Glob, Grep, Bash(git:*), Bash(linear:*)
disallowedTools: Write, Edit
model: opus
effort: high
permissionMode: plan
---
You are the Planner. Output: docs/designs/{story-id}.md.
You cannot write code. Load story, constitution, architecture, tech-stack, patterns, adjacent code, last-3 designs.
Output sections: Problem, Design (+diagrams), Patterns applied, SOLID/DRY impact, Interfaces, Data model, File list, Alternatives, Risks.
```

```yaml
# .claude/agents/implementer.md
---
name: implementer
description: TDD Ralph loop — implement story against design + failing tests
tools: Read, Write, Edit, Bash
model: sonnet  # or composer-2 in Cursor
effort: high
---
You are the Implementer. Follow docs/designs/{id}.md and pass docs/tests/{id}.md.
Work test-first. Exit only when all tests green AND you emit <promise>STORY_COMPLETE</promise>.
If iterations hit 30 without completion, commit current progress and emit <promise>BLOCKED</promise>.
```

```yaml
# .claude/agents/reviewer.md
---
name: reviewer
description: Multi-angle PR review + coverage check
tools: Read, Glob, Grep, Bash(gh:*), Bash(linear:*)
model: sonnet
effort: high
---
You are the Reviewer. Load PR diff, design.md, tests, coverage report.
Produce review sections: Security, Performance, Accessibility, Code Quality, Architecture Drift, Coverage Delta.
Critical findings → GitHub status check FAIL, Linear issue created.
Non-critical → PR comment.
```

---

## Appendix B — Starter Hook Scripts (abbreviated)

```bash
# scripts/hooks/enforce-plan-mode.sh
# PreToolUse(Write|Edit) hook. Refuses writes unless design.md exists for current branch.
#!/bin/bash
INPUT=$(cat)
BRANCH=$(git branch --show-current)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
if [ -z "$STORY_ID" ]; then exit 0; fi  # not a story branch
if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No design.md for ${STORY_ID}. Run Planner first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi
exit 0
```

```bash
# scripts/hooks/verify-completion-promise.sh
# Stop hook. Prevents agent exit until promise is emitted and tests are green.
#!/bin/bash
INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count')
MAX=30
if [ "$LOOP" -ge "$MAX" ]; then echo '{}'; exit 0; fi
SCRATCH=".cursor/scratchpad.md"
if grep -q "STORY_COMPLETE" "$SCRATCH" 2>/dev/null && npm test --silent > /dev/null 2>&1; then
  echo '{}'
else
  echo "{\"followup_message\": \"Iteration $((LOOP+1))/$MAX. Keep going. Emit <promise>STORY_COMPLETE</promise> only when all tests pass.\"}"
fi
```

---

## Appendix C — One-Page Operating Guide (what the human does day-to-day)

**Morning (10 min):** Open Cursor 3 Agents Window. Glance at kanban. Review any draft PRs from overnight runs. Unblock anything marked `BLOCKED`.

**Story creation (30 min per epic):** Use Analyst + Architect to draft epics and stories into Linear. Move the top N to `Ready`.

**During the day:** You mostly review PRs. The system picks up `Ready` stories automatically. Your interventions are: rewording a story if the Planner flagged ambiguity; approving design.md for risky stories (optional); merging PRs.

**Weekly (60 min):** Review the Monday Slack rollup. Look at flake rate, coverage trend, cycle time. Tune rules/hooks based on the top 3 friction points.

**Per model update:** Run eval suite against a canonical set of stories. Pin model if regression.

---

*End of design.*
