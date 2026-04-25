# Autonomous Software Engineering Kit

A complete blueprint and starter files for running an autonomous software engineering workflow. Two supported implementation paths: **Hybrid** (Cursor 3 + Claude Code) or **Pure Cursor**. Both produce the same architecture.

## Contents

### Design documents (read in this order)

1. `autonomous-swe-design.md` — the core design. Platform landscape, four-layer architecture, the seven base personas, the autonomous story loop, Epic 0, testing strategy, hooks/rules/branching, migration path.
2. `autonomous-swe-design-ux-addendum.md` — the UX/UI extension. Free-first tool stack, paper.design analysis, Onlook roundtrip, UX Engineer persona, design tokens, visual regression.
3. `MEMORY-AND-CONTEXT.md` — the memory and codebase context layer. Serena for structural code understanding; MemPalace or mcp-memory-service for session memory; diary-append hook as tool-independent backup.
4. **`COST-ANALYSIS.md`** — full review of all implementation options with monthly cost estimates for light/medium/heavy usage, and how each runs the autonomous implementation phase. Updated with Pure-Cursor split (local-only vs cloud-on) and Microsoft Copilot coverage (GitHub + M365). **Read this before choosing a path.**
5. **`IMPLEMENTATION-GUIDE-UNIFIED.md`** — step-by-step setup covering **five variants** (Pure Cursor local-only, Pure Cursor cloud, Claude Code only, Cline + Ollama, OpenCode + GLM) with **Extended TDD flow** where the Test Architect selects multi-tier test targets and the Implementer drives all of them to green. Also documents the GitHub Copilot variant's Coding-Agent adaptation.
6. `IMPLEMENTATION-GUIDE.md` — original two-path guide (Hybrid + Pure Cursor). Retained for readers who just want that subset.

### Agent personas (drop into `.claude/agents/` and/or `.cursor/commands/`)

All eight personas work in both Claude Code and Cursor formats.

- `agents/analyst.md` — **Mara**. Discovery, domain research, project brief.
- `agents/architect.md` — **Arc**. PRD, architecture, tech stack, UX direction, backlog.
- `agents/platform-engineer.md` — **Plat**. Environments, CI/CD, IaC, observability.
- `agents/test-architect.md` — **Tess**. Test strategy, per-story test plans, coverage audits.
- `agents/planner.md` — **Plan**. Per-story design doc. Read-only, cannot write code.
- `agents/implementer.md` — **Imp**. TDD Ralph loop executor. Iterates until green.
- `agents/reviewer.md` — **Rev**. Multi-angle PR review (security, perf, a11y, quality, coverage, UI).
- `agents/ux-engineer.md` — **Ume**. Design tokens, primitives, Storybook, visual regression.

## First-run: project onboarding workflow

Before path selection, run the **BMAD-style project onboarding workflow** to populate the foundation document set, generate Epic 0, and import the backlog into Linear:

- Workflow: `docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding/workflow.md`
- Cursor command: `/project-onboard`
- Outputs: `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/tech-stack.md`, `docs/ux-principles.md`, `docs/ux.md`, `docs/constitution.md`, `docs/environments.md`, `docs/observability.md`, `docs/test-strategy.md`, `docs/design-system.md`, `docs/backlog.md`, `.cursor/rules/01..10`, `AGENTS.md`, plus a Linear project (team `Tokenomik`) with Epic 0 first.

The orchestrator loads each persona for the relevant step, halts at every artifact gate, tracks state in `docs/_onboarding-state.md`, and only invokes optional `party-mode` / `advanced-elicitation` sub-workflows if those files exist.

## Quick path selector

See `COST-ANALYSIS.md` for the full decision tree and all options. The short version:

**Path A — Cursor + Claude Code (Hybrid)** — $200–400/mo steady state, up to $2,000+/mo without spend caps. Best capability ceiling. Best for experienced operators who will discipline cloud-agent use.

**Path B — Pure Cursor** — $20–200/mo depending on cloud-agent use. Simplest single-vendor setup. Good if you want the visual IDE and can keep cloud agents throttled.

**Path C — Claude Code only (no Cursor)** — $20 (Pro) to $200 (Max 20x) flat. **Best cost-to-capability ratio.** Best predictability. VS Code + Onlook cover the visual workflow. Recommended for cost-sensitive operators who still want full autonomy.

**Path D — Cline + BYO API (or local Ollama)** — $0 (Ollama) to $100–200/mo (API). Open-source, model-agnostic, best for privacy-sensitive / air-gapped work. Some orchestration gaps.

**Paths E–H (Copilot, Codex, Aider, OpenCode)** — niche choices covered in `COST-ANALYSIS.md`.

The `IMPLEMENTATION-GUIDE.md` documents Paths A and B step-by-step. Paths C and D use the same personas, rules, hooks, and MCP servers — the setup steps are a subset of Path A's (Claude Code section) or involve swapping the agent harness while keeping everything else. See `COST-ANALYSIS.md` §3.3 and §3.4 for their concrete implementation-phase mechanics.

## Persona quick-reference

| #   | Persona           | Nickname | When runs                        | Primary output                                                                         |
| --- | ----------------- | -------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Analyst           | Mara     | Ideation                         | `docs/brief.md`                                                                        |
| 2   | Architect         | Arc      | Ideation                         | `prd.md`, `architecture.md`, `tech-stack.md`, `ux.md`, `constitution.md`, `backlog.md` |
| 3   | Platform Engineer | Plat     | Epic 0 + as-needed               | `infra/`, `.github/workflows/`, `environments.md`                                      |
| 4   | Test Architect    | Tess     | Epic 0 + per story               | `test-strategy.md`, `docs/tests/{id}.md`, test harness                                 |
| 5   | Planner           | Plan     | Per story (first)                | `docs/designs/{id}.md`                                                                 |
| 6   | Implementer       | Imp      | Per story                        | Code + unit tests + commits                                                            |
| 7   | Reviewer          | Rev      | Per story (PR)                   | Structured PR review                                                                   |
| 8   | UX Engineer       | Ume      | Ideation + Epic 0 + per UI story | `tokens/`, `components/primitives/`, Storybook, baseline                               |

## Tool dependencies

| Role                       | Tool                            | Path A | Path B                                      | Cost                       |
| -------------------------- | ------------------------------- | ------ | ------------------------------------------- | -------------------------- |
| Primary IDE                | Cursor 3                        | ✓      | ✓                                           | $20–60/mo Pro              |
| CLI agent                  | Claude Code                     | ✓      | —                                           | Anthropic API              |
| Cursor CLI (for scripts)   | `cursor-agent`                  | ✓      | ✓                                           | Included                   |
| Specs                      | GitHub Spec Kit                 | ✓      | ✓                                           | Free                       |
| Kanban                     | Linear                          | ✓      | ✓                                           | Free tier fine             |
| Codebase context           | **Serena** (MCP)                | ✓      | ✓                                           | Free                       |
| Session memory + diarising | **MemPalace** (MCP)             | ✓      | ✓                                           | Free, local                |
| Primitives                 | shadcn/ui + Base UI or Radix    | ✓      | ✓                                           | Free                       |
| Tokens                     | DTCG v1 + Style Dictionary      | ✓      | ✓                                           | Free                       |
| Storybook                  | Storybook + addon-a11y          | ✓      | ✓                                           | Free                       |
| E2E                        | Playwright + Test Agents        | ✓      | ✓                                           | Free                       |
| Visual regression          | Playwright `toHaveScreenshot()` | ✓      | ✓                                           | Free                       |
| Roundtrip editor           | Onlook                          | ✓      | ✓ (optional if Cursor Design Mode suffices) | Free (Apache 2.0)          |
| AI canvas                  | paper.design                    | ✓      | ✓                                           | Free tier 100 MCP calls/wk |
| Design handoff (alt)       | Penpot                          | ✓      | ✓                                           | Free, unlimited            |
| Linting                    | vibecop (keep)                  | ✓      | ✓                                           | Free                       |

All tools listed as "Free" are genuinely free forever for the scope described — no trial periods or feature gates that affect the workflow.

## Reading order for first-time setup

1. `autonomous-swe-design.md` (60 min) — the what and why
2. `autonomous-swe-design-ux-addendum.md` (30 min) — the UX layer
3. `MEMORY-AND-CONTEXT.md` (20 min) — the memory/context stack
4. **`COST-ANALYSIS.md` (25 min) — the options review + cost estimates. Choose your path here.**
5. `IMPLEMENTATION-GUIDE.md` (30 min) — the how; follow phase by phase
6. Each persona as you reach the phase that uses it

## What changed vs the previous revision

This revision adds:

- **`MEMORY-AND-CONTEXT.md`** — a dedicated review of MemPalace vs Serena vs Cipher/ByteRover vs OpenMemory vs mcp-memory-service, with the recommendation to combine **Serena (codebase context) + MemPalace (session memory + diary) + a tool-independent `diary-append` hook**.
- **Path B (Pure Cursor)** — a full alternative implementation path for users who don't want Claude Code. Every phase and command now has Path A / Path B callouts.
- **Rules 40 (Serena) and 41 (MemPalace)** — wired into every agent's always-on context.
- **`diary-append.sh` hook** — appends timestamped markdown entries to `docs/diary/{YYYY-MM}/` on session start, tool use, and stop. Lives in your repo; survives any tool swap.
- **Updated persona definitions** — the auto-diarising prompt is layered in via rule 41 rather than duplicated in every persona file, keeping personas lean.
