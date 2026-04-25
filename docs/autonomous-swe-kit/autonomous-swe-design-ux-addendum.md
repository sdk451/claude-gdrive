# Autonomous Software Engineering Workflow — UX/UI Addendum

**Companion to** `autonomous-swe-design.md`. This document adds a structured UX/UI design process, an 8th agent persona, a free-tool-first toolchain, and a bidirectional roundtrip workflow that lets humans edit the live app in a WYSIWYG canvas and have those changes flow back into the codebase as PRs.

---

## 1. Why Vibe Code UX Is Broken (Failure-Mode Analysis)

Before prescribing fixes, worth naming what's actually going wrong. Across the vibe coding community, the pattern is remarkably consistent:

| Failure mode | Root cause |
|---|---|
| No design tokens — hex colors and magic pixel values strewn through code | Agent invents values per prompt; no enforced source of truth |
| Components are one-offs, not primitives — every button is slightly different | No primitives layer; agents generate full components from scratch each time |
| Inconsistent spacing, typography, radius across screens | No token-driven scale; agent picks "reasonable" values each time |
| Hard to restyle — changing the brand means rewriting dozens of files | Styles baked into components instead of flowing from tokens |
| No export-to-design for WYSIWYG tweaking | Traditional design tools design *pictures* of divs, not divs themselves |
| No drag-and-drop refinement by a human | Code-first tooling assumes humans will prompt or type |
| No roundtrip — once it's code, it's code | Canvas and code are in different universes |
| Accessibility an afterthought (or absent) | No primitives library enforcing ARIA, focus, keyboard |
| UI regressions ship silently | E2E tests check behaviour, not appearance |
| "AI slop" look — everything reads like three variations of the same SaaS template | Models default to their training-data mode: shadcn-dark + lucide icons + Tailwind grey |

The fix has three parts: **architecture** (tokens → primitives → blocks, never ad-hoc code), **tooling** (canvas tools that speak HTML/CSS and edit real code), and **process** (an agent and a workflow that enforce both).

---

## 2. Design Principles — The Architectural Commitments

These are non-negotiable and should go in `docs/constitution.md`:

1. **Design tokens are the single source of truth.** Every color, spacing, typography, radius, elevation, and motion value in the running app traces back to a DTCG-format token file. No hex codes in components. No magic pixel numbers. Agents may read tokens but must not invent values.
2. **Three-layer component hierarchy — always.**
   - `components/ui/` — primitives (shadcn-style, installed, minimal customization)
   - `components/primitives/` — lightly wrapped primitives with project-specific defaults
   - `components/blocks/` — product-level compositions built from primitives
3. **Design is the code.** The canvas must export or edit real HTML/CSS/JSX, not render a proprietary file format. Figma-style "picture of a div" is banned from the production loop.
4. **Every UI story has a visual regression baseline.** If the UI changes, the snapshot changes, and a human approves the diff before merge.
5. **Accessibility is a primitive-layer responsibility.** Primitives handle ARIA, keyboard, focus. Blocks and product code build on that foundation; they don't reinvent it.
6. **Themes are swappable.** Re-theming should be a token-file change, not a code change. Brand swap, light/dark, density (cosy/compact), and RTL are all token-level switches.

---

## 3. Recommended Tool Stack (Free-First)

The ecosystem shifted sharply in Q1 2026. The stack below is free (or free-tier-sufficient), open-standard, and avoids Figma's MCP tier lock.

### Layer 1 — Design System Foundations (all free, all open)

| Layer | Tool | Why |
|---|---|---|
| Token format | **DTCG v1** (W3C Design Tokens spec) | Industry-standard as of Oct 2025, stable v1, adopted by Figma, Framer, Penpot, Adobe, Google, Microsoft. Free forever. |
| Token build | **Style Dictionary v4+** | Transforms DTCG tokens into CSS vars, Tailwind config, iOS/Android values. Mature, free, scriptable. |
| Primitives | **shadcn/ui** (with Base UI *or* Radix) | Copy-into-your-repo components. Free. CLI v4 (March 2026) adds `shadcn/skills` so agents generate correct code. Registry:base lets you ship your own design system as one install. |
| Styling | **Tailwind CSS v4** | The de-facto 2026 standard; aligns with every AI coding tool's training data. Free. |
| Catalogue | **Storybook** (latest stable) | Component library browser, accessibility addon, visual regression hooks. Free. |
| Icons | **Lucide** (if shadcn) or **Iconify** | Both free and agent-friendly. |

### Layer 2 — Visual Canvas (three options, each for a different moment)

| Tool | Model | Free tier | Best for |
|---|---|---|---|
| **Penpot** | Open-source, self-hostable | Unlimited users + files + projects, free forever, 10 GB on cloud (free tier) | Greenfield ideation, wireframing, mature UX workflow, handoff-style specs, team collab at any scale |
| **Paper.design** | Closed-source, HTML/CSS-native canvas with MCP | 100 MCP tool calls/week on free tier (enough for design-time use; the cap bites only with heavy agent automation) | AI-assisted canvas design; agent reads/writes the canvas; lightweight AI-first iteration; shaders for bespoke visual styles |
| **Onlook** | Open-source (Apache 2.0), edits live React code via AST | Free forever for self-host, only cost is your AI API calls | The roundtrip piece — the human opens the *running app* in Onlook, drags, restyles, commits; changes land as a PR |

**The roundtrip recommendation:** Use all three, but Onlook is the one that solves the user's specific ask ("humans drag-and-drop, then re-import as code"). It instruments your Next.js + Tailwind app with `data-oid` attributes at build time, maps every DOM node to its source line, and writes edits back via AST manipulation. There is no export step and no re-import step. The code *is* what you're editing.

### Layer 3 — Validation (all free)

| Tool | Role |
|---|---|
| **Playwright `toHaveScreenshot()`** | Visual regression per component + per page, across browsers and breakpoints. Integrates with Playwright Test Agents from the main design. |
| **axe-core** (via `@axe-core/playwright`) | Automated a11y checks in E2E. |
| **Storybook accessibility addon** | Manual + automated a11y at the component level. |
| **Chromatic** (optional, has free tier) | Hosted visual regression with review UI. Free tier = 5,000 snapshots/month. |

### What to skip (and why)

- **Figma**: MCP requires Professional plan ($15/seat/month) and Code Connect setup can take a day per component library. Reasonable for teams already on Figma; wasteful for a greenfield autonomous build.
- **Lovable / v0 / Bolt / Replit Agent for the primary loop**: Useful for bootstrapping a spike or sanity-checking a screen, but they produce slop-shaped code that needs a deliberate pass before it's production. Treat their output as wireframes, not final code. Onlook (which is explicitly positioned as the open-source alternative to these) is strictly better for production work.
- **tldraw Make Real** / **screenshot-to-code**: Great for first-30-seconds ideation. Not a production tool. Optional nice-to-have for the Analyst/Architect during ideation.

---

## 4. Paper.design — Deep Dive and When to Use It

The user specifically asked about Paper. Here's the honest assessment.

**What makes Paper different:** It's the only design tool built on a real HTML/CSS canvas. Every element is a real div with real CSS properties — no proprietary file format, no "export" step. The Paper MCP server (launched March 2026) exposes 24 bidirectional tools: read (`get_selection`, `get_jsx`, `get_screenshot`, `get_computed_styles`) and write (`create_artboard`, `write_html`, `set_text_content`, `update_styles`). An agent in Claude Code or Cursor can both inspect and modify the canvas.

**Where it fits in this workflow:**

- **Ideation phase** for visually exploring a design direction with AI collaboration — "show me three variations of this pricing page with different vertical rhythm"
- **Design handoff** when the Architect wants to leave structured notes on a mockup that the Planner can read via MCP
- **Token sync demos** — Paper is uniquely good at pulling tokens from your codebase into the canvas

**The 100-calls-per-week free tier** is fine for design-time human use (you're not calling MCP tools every click — only when the agent reads/writes). It's tight for always-on agent automation; if you hit the cap, the Pro tier is ~$20/mo, cheaper than a Figma Pro seat with Dev Mode.

**The honest caveat:** Paper is in open alpha. Features like component systems, version history, advanced prototyping, and team admin are still in progress. Penpot is more mature; Onlook is more code-native. Paper's unique value is the AI-first canvas and the HTML/CSS foundation — use it for that, not as a Figma replacement.

**Recommendation:** Install Paper. Use it for greenfield AI-assisted design exploration and when the round-trip involves "what should this *look* like" rather than "how do I edit the running app." Use Onlook when the round-trip involves the running app.

---

## 5. New Persona: UX Engineer

### Rationale

Adding an 8th persona because the UX gap is too consistent and too consequential to fold into another role. Calling it UX Engineer (not UX Designer) signals the hybrid scope — this agent owns both the design system artifacts and the code that implements them. In a human team this is the role where a design-system-fluent frontend engineer lives.

### Persona definition

```yaml
---
name: ux-engineer
description: Owns design system, UI primitives, component library, visual regression
tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch
model: opus  # design work benefits from stronger reasoning
effort: high
---
# UX Engineer Agent

You are the UX Engineer. You own the project's visual and interaction foundation.

## Epic 0 responsibilities (one-off)
1. Produce `tokens/*.tokens.json` in DTCG v1 format (color, typography, spacing, radius, elevation, motion)
2. Run Style Dictionary build → CSS vars, Tailwind config, any platform outputs
3. Run `pnpm dlx shadcn@latest init --base base-ui` (or radix) to scaffold primitives
4. Install `shadcn/skills` so downstream agents use primitives correctly
5. Create `components/primitives/` wrapping the raw shadcn components with project defaults
6. Set up Storybook with @storybook/addon-a11y, at least one story per primitive
7. Create `visual-baseline/` with Playwright screenshot tests for each primitive and each breakpoint
8. Author `docs/design-system.md` — the decision record (constitution for visual concerns)

## Per-story responsibilities (when UI-affecting)
- Review story alongside Planner; flag stories that need new primitives vs compose existing
- If a new primitive is needed: design it (Paper or Penpot), implement it, story it, snapshot it, before the story moves to Implementer
- If existing primitives suffice: write a `docs/designs/{story-id}-ui.md` appendix specifying which primitives and tokens to use

## Hard rules
- NEVER hardcode hex, rgba, or pixel values outside `tokens/` or `tailwind.config.ts`
- NEVER write component code outside `components/ui/`, `components/primitives/`, or `components/blocks/`
- NEVER invent new tokens without updating the DTCG source
- If a Figma or Paper design uses a value not in tokens, STOP and add it to tokens first
```

### How the 8 personas interact

```
                       ┌──────────────┐
                       │   Analyst    │
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐         ┌──────────────┐
                       │  Architect   │◄───────►│ UX Engineer  │  (Ideation: collab on UX)
                       └──────┬───────┘         └──────┬───────┘
                              │                        │
                              ▼                        ▼
   Epic 0:  Platform Engineer ─── Test Architect ─── UX Engineer
                              │
                              ▼
                       ┌──────────────┐
                       │   Planner    │◄──┐
                       └──────┬───────┘   │  (if UI-affecting story, Planner consults
                              │            │   UX Engineer for component plan)
                              ▼            │
                       ┌──────────────┐   │
                       │Test Architect│   │
                       └──────┬───────┘   │
                              │            │
                              ▼            │
                       ┌──────────────┐   │
                       │ Implementer  │───┘
                       └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Reviewer   │   (Reviewer gains a UI-review lane
                       └──────────────┘    that checks primitives + tokens usage)
```

---

## 6. Epic 0 Additions — The Design System Foundation

Adds a UX Engineer track to Epic 0, running in parallel with Platform Engineer and Test Architect.

### 6.1 Token architecture

Produce `tokens/` tree in DTCG v1 format, split across files for maintainability:

```
tokens/
  core/           # primitive tokens — raw values
    color.tokens.json       # brand scales 50-950, neutrals
    typography.tokens.json  # font families, sizes, weights, line heights
    spacing.tokens.json     # 4-based or 8-based scale
    radius.tokens.json
    elevation.tokens.json
    motion.tokens.json
  semantic/       # semantic tokens — reference core via aliases
    color.tokens.json       # surface, text, action, border, feedback
    typography.tokens.json  # heading-1, body, caption, code
  component/      # component-specific tokens (rare; use sparingly)
    button.tokens.json
themes/
  light.tokens.json
  dark.tokens.json
  brand-a.tokens.json       # optional alternate brands
```

Build output:
```
generated/
  tokens.css                # CSS custom properties
  tailwind-tokens.ts        # for extending tailwind.config.ts
  tokens.android.xml        # only if native
  tokens.ios.swift          # only if native
```

Every downstream agent references these. Rules in `.cursor/rules/design-system.mdc`:
- `alwaysApply: true`
- Lists all semantic tokens and what they mean
- Forbids hex/rgb/pixel literals in component code
- Globs: `components/**/*.{ts,tsx,css}`

### 6.2 Primitive library scaffolding

```bash
# UX Engineer runs during Epic 0
pnpm dlx shadcn@latest init --base base-ui --template next
pnpm dlx shadcn@latest add button input card dialog dropdown-menu ...
pnpm add -D @shadcn/cli-skills  # so agents know how to use shadcn correctly
```

Then wraps each primitive in `components/primitives/` with project defaults:

```tsx
// components/primitives/AppButton.tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AppButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button className={cn("font-medium tracking-tight", className)} {...props} />
}
```

Agents are told (via `design-system.mdc`): "Always import from `@/components/primitives`, never directly from `@/components/ui`."

### 6.3 Storybook + a11y

Every primitive gets at least one story and passes the a11y addon. Storybook runs in CI; a11y violations fail the build.

### 6.4 Visual regression baseline

Playwright screenshot tests for the primitive matrix (each primitive × each variant × each theme × three breakpoints). These live in `tests/visual/primitives/` and are the baseline against which every subsequent UI change is compared.

```ts
// tests/visual/primitives/button.spec.ts
import { test, expect } from "@playwright/test"

for (const theme of ["light", "dark"]) {
  for (const size of [320, 768, 1280]) {
    test(`button matrix — ${theme} @ ${size}px`, async ({ page }) => {
      await page.goto(`/storybook?theme=${theme}`)
      await page.setViewportSize({ width: size, height: 800 })
      await expect(page.locator("#button-matrix")).toHaveScreenshot()
    })
  }
}
```

### 6.5 Exit gate (added to Epic 0)

- Tokens built and published to CSS vars
- shadcn init complete with Base UI primitives
- All primitives have Storybook stories passing a11y addon
- Visual regression baseline committed
- `docs/design-system.md` exists and explains the architecture

---

## 7. The UX-Aware Story Loop

Stories now route through one of two paths at Stage 1 of the loop (see §6 of the main design).

### Classification step (auto, by Planner)

When Planner loads a story, it first classifies:
- **Backend-only** (no UI change) → the existing 6-stage loop from the main design. Nothing changes.
- **UI-compose** (uses existing primitives, no new ones) → the existing loop + a `{story-id}-ui.md` appendix from UX Engineer.
- **UI-new** (needs a new primitive or significant design work) → UX Engineer runs *first*, before Planner.

Classification heuristic is in `.cursor/rules/planner.mdc`:
```
If the story mentions a UI element that does not exist in components/primitives/
or components/blocks/, classify as UI-new.
If the story changes appearance/layout of existing UI, classify as UI-compose.
Otherwise, backend-only.
```

### UI-new story flow (the expanded loop)

```
Linear "Ready"  →  UX Engineer (design + build primitive)
                       ├─ Paper / Penpot canvas exploration (AI or human)
                       ├─ Primitive implementation in components/ui/ or components/primitives/
                       ├─ Storybook story + a11y pass
                       ├─ Visual baseline snapshot
                       └─ Commits to a `ux/` sub-branch of the feature worktree
                   →  Planner (now has the primitive to reference)
                   →  Test Architect
                   →  Implementer
                   →  Reviewer (now includes UI-review lane; see §9)
                   →  PR
```

The UI-new flow runs UX Engineer in the *same* worktree as Implementer, just committing first. This keeps the design system and feature work coherent in one PR when they're tightly coupled. For larger design-system work (new primitive families, token overhauls), UX Engineer gets its own worktree and PR, and feature work depends on it.

### UI-compose story flow

```
Linear "Ready"  →  Planner  (classifies as UI-compose; invokes UX Engineer briefly)
                    ├─ Planner produces design.md
                    └─ UX Engineer produces ui.md appendix:
                       - Which primitives to use
                       - Which tokens apply
                       - Any block-level patterns to reuse
                 →  Test Architect (includes visual regression snapshot plan)
                 →  Implementer
                 →  Reviewer (UI lane)
                 →  PR
```

---

## 8. The Human Roundtrip Workflow

This is the answer to "no simple export of code to design, where a human could drag and drop and redesign." It's a first-class workflow, not an afterthought.

### 8.1 Onlook roundtrip (for editing the running app)

```
┌─ Human wants to tweak a screen visually ──────────────────────────────┐
│                                                                        │
│ 1. Start the app: pnpm dev (Next.js + Tailwind, with @onlook/nextjs    │
│    build plugin so components get data-oid attributes)                 │
│ 2. Open Onlook, point at localhost:3000                                │
│ 3. Drag elements, change Tailwind classes, tweak spacing, restyle      │
│ 4. Onlook patches the actual .tsx files via AST manipulation           │
│ 5. Onlook creates a local git branch with the changes                  │
│ 6. Human opens a PR from that branch                                   │
│ 7. CI runs — including visual regression tests                         │
│ 8. Reviewer agent runs on the PR (sees actual code diffs, not a "design hand-off")│
│ 9. Merge                                                               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

This is genuinely roundtrip: the human doesn't leave the codebase. They're editing real JSX and real Tailwind classes, just through a visual UI. Because Onlook uses AST manipulation with `data-oid` source mapping, there's no "generated code" — it's *your* code, edited the way a human editor would edit it.

### 8.2 Paper canvas-to-code roundtrip (for greenfield or major redesigns)

```
┌─ Human/Analyst explores a new design direction ───────────────────────┐
│                                                                        │
│ 1. Open Paper, create an artboard                                      │
│ 2. Sync design tokens from repo via Paper MCP                          │
│    "Claude, read tokens/semantic/color.tokens.json and create color    │
│     styles in Paper"                                                   │
│ 3. Design the new screen/flow on the canvas                            │
│ 4. Ask agent: "Convert the current artboard to a React + Tailwind      │
│    component in src/app/(...) using our primitives from                │
│    components/primitives/"                                             │
│ 5. Agent opens PR, Reviewer runs, CI runs                              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

This is the path for when the design doesn't exist yet. The loop is: imagine → canvas → tokens applied → code → review → merge.

### 8.3 Penpot for traditional design-then-build

```
┌─ Team prefers traditional handoff for some work ──────────────────────┐
│                                                                        │
│ 1. UX Engineer (or a human designer) composes screen in Penpot         │
│ 2. Penpot exports CSS/HTML/SVG + design tokens                         │
│ 3. Tokens diffed against tokens/ in repo — new values flagged          │
│ 4. Planner + UX Engineer convert to code using primitives              │
│ 5. Standard loop from there                                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

Penpot is the "mature, predictable, free" option. If your team already does figma-style handoffs, this is the drop-in.

### 8.4 Which tool to reach for

| Intent | Tool |
|---|---|
| "I want to tweak this button's spacing on the running app" | **Onlook** |
| "I want to quickly explore three variations of a new pricing page" | **Paper** |
| "I want to design a screen I can present to a stakeholder before building" | **Penpot** or **Paper** |
| "I have a sketch on a whiteboard; give me a first cut" | **tldraw Make Real** |
| "We already have an established Figma library we can't abandon" | **Figma** (pay the $15/seat for MCP; out of scope of this free-first recommendation, but supported) |

---

## 9. Hooks, Rules, and CI Additions

### 9.1 New hooks

| Event | Hook | Action |
|---|---|---|
| PreToolUse(Write\|Edit) | `enforce-tokens.sh` | Scans the proposed content; if it contains hex literals (outside `tokens/` or theme files), blocks the write with a message directing to use semantic tokens |
| PreToolUse(Write\|Edit) | `enforce-primitive-imports.sh` | If a file under `app/` or `pages/` imports from `@/components/ui` directly, redirects to `@/components/primitives` |
| PostCommit | `token-diff.sh` | If `tokens/` changed, runs `style-dictionary build` and regenerates outputs |
| PrePR | `visual-regression.sh` | Runs Playwright visual tests; if diffs exist, requires human approval of snapshots |

### 9.2 New rules

`.cursor/rules/design-system.mdc` — `alwaysApply: true`, ~500 tokens max, containing:
- The three-layer hierarchy (primitives, primitives-wrapped, blocks)
- The semantic token names and meanings (list, ~20 entries)
- Forbidden patterns (hex, `px` outside of specific cases, inline styles, direct `@/components/ui` imports)
- Location of the design system decision record

`.cursor/rules/ui-stories.mdc` — scoped `globs: ["components/**", "app/**/*.tsx", "pages/**/*.tsx"]`:
- When making visual changes, update or create a Storybook story
- When creating a new primitive, add a visual regression test
- Prefer composition of existing primitives over creating new ones

`AGENTS.md` (repo root) gets a "Design system" section that summarises the above in plain markdown for any agent that doesn't read `.mdc` files.

### 9.3 shadcn/skills

Install the official shadcn/skills so coding agents know how to use your registry correctly. This is a single install and covers how shadcn CLI, Base UI vs Radix, and registry workflows are supposed to work — eliminating a whole class of agent hallucinations.

```bash
pnpm dlx shadcn@latest skills install
```

### 9.4 Visual regression tier added to testing strategy

The main design's test pyramid gains a sixth tier:

| Tier | Scope | Tool | Runs on |
|---|---|---|---|
| 6. Visual regression | Pixel diffs on primitives, blocks, pages | Playwright `toHaveScreenshot()` | PR if UI-affecting; nightly full-matrix run |

Snapshot review flow:
- PR UI diff fails → Reviewer agent posts the diff image on the PR
- Human labels as "intentional" (updates baseline) or "regression" (fails the PR)
- Automated: if >20% pixel diff and the story was classified UI-new, the PR is auto-labelled "needs visual review"

### 9.5 Reviewer UI lane

The Reviewer persona gains a UI review lane (active when files under `components/**` or `app/**/*.tsx` changed). It checks:

1. No hex/rgb/pixel literals outside tokens
2. All visual values trace to tokens (or flag what doesn't)
3. Primitives used from `@/components/primitives`, not `@/components/ui` directly
4. Storybook story exists for any new or modified primitive
5. Visual regression snapshots reviewed
6. a11y: axe violations in Playwright output
7. Responsive: snapshots exist at all three breakpoints

---

## 10. Putting It All Together — The Complete 8-Persona Architecture

Updated from the main design, this is the full picture with UX Engineer integrated:

```
┌───────────────────────────────────────────────────────────────────────┐
│ IDEATION — Analyst + Architect + UX Engineer                          │
│   Outputs: brief, prd, architecture, tech-stack,                      │
│            ux wireframes (Penpot or Paper),                           │
│            design tokens (DTCG), constitution                         │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│ EPIC 0 — Platform Engineer + Test Architect + UX Engineer (parallel)  │
│   Platform:   envs, CI/CD, observability, IaC                         │
│   Test:       strategy, 5-tier harness, coverage, coherent reporting  │
│   UX:         tokens pipeline, shadcn primitives, Storybook,          │
│               visual regression baseline, design-system.md            │
│   Exit gate:  hello-world ships to all envs; primitive matrix        │
│               snapshot set committed                                  │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│ STORY LOOP — triage-by-type, 8 personas available                     │
│                                                                       │
│   Backend-only:                                                       │
│     Planner → Test Architect → Implementer → Reviewer → PR           │
│                                                                       │
│   UI-compose:                                                         │
│     Planner → UX Engineer (ui.md) → Test Architect (incl. visual)    │
│     → Implementer → Reviewer (UI lane) → PR                          │
│                                                                       │
│   UI-new:                                                             │
│     UX Engineer (design + primitive + snapshot) → Planner → Test Arch │
│     → Implementer → Reviewer (UI lane) → PR                          │
│                                                                       │
│   Human roundtrip (any time):                                         │
│     Running app → Onlook edit → branch → PR → Reviewer → merge       │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────┐
│ VERIFICATION — 6 tiers + coverage expansion                           │
│   unit → api → component → e2e → ux-flow → visual-regression         │
│   Playwright Test Agents (Planner/Generator/Healer)                  │
│   Smart test selection per change                                    │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 11. Migration Additions (Week-by-Week Updates)

The original 6-week migration in §11 of the main design gains UX Engineer work in weeks 1–3:

- **Week 1** (Foundations): author UX Engineer persona; install Style Dictionary, shadcn CLI, shadcn/skills, Storybook, Playwright visual-regression scaffolding
- **Week 2** (Epic 0): UX Engineer in parallel with Platform and Test Architect — produces tokens, primitives, Storybook, baseline snapshots
- **Week 3** (First story): include one UI-new story; validate the full UX Engineer → Planner handoff; install Onlook and run one manual roundtrip to prove the loop
- **Week 4** (CI): visual regression tests wired into PR checks with snapshot review flow
- **Week 5** (Parallelism): Paper MCP enabled for AI-assisted canvas exploration during ideation
- **Week 6** (Retro): measure UI consistency (token-adherence rate, primitive re-use rate, visual regression pass rate)

---

## 12. Practical First-Week Checklist

If you want to start this tomorrow, here is the minimum viable sequence:

1. **Choose primitive base**: `pnpm dlx shadcn@latest init --base base-ui` (Base UI is the 2026 lighter-weight choice; Radix is the heavier, more feature-complete choice — either is fine)
2. **Install shadcn/skills**: `pnpm dlx shadcn@latest skills install`
3. **Scaffold token files**: create `tokens/core/` and `tokens/semantic/` with DTCG v1 JSON files; install Style Dictionary v4+; write a build script
4. **Add `.cursor/rules/design-system.mdc`** with the forbidden patterns and token names
5. **Install Storybook**: `pnpm dlx storybook@latest init`; add `@storybook/addon-a11y`
6. **Set up Playwright visual regression**: configure `toHaveScreenshot()` with a stable browser + threshold; commit initial snapshots
7. **Install Onlook** on a developer machine (free, open source): `pnpm dlx @onlook/cli init`; add `@onlook/nextjs` to `next.config.js`
8. **Try Paper** with the MCP server in Claude Code: `claude mcp add paper --transport http http://127.0.0.1:29979/mcp --scope user`; test one canvas-to-code round trip on a non-critical page
9. **Author the UX Engineer persona** as a Cursor shared command AND a `.claude/agents/ux-engineer.md` file
10. **Pilot one UI-new story** with the new flow; debrief and tune

Every tool above is free. Your only recurring cost is AI API usage, which is independent of this toolchain.

---

## 13. What Success Looks Like

Six weeks in, a UI-affecting story should look like this end-to-end:

1. Linear: story `AUTH-142 "New password-reset screen with progress steps"` moves to Ready
2. Cursor Automation spawns a worktree; Planner classifies as UI-new (has "progress steps" primitive that doesn't exist yet)
3. UX Engineer designs the progress-steps primitive in Paper, using the existing token set; converts to React + Tailwind in `components/ui/progress-steps.tsx`; wraps as `components/primitives/ProgressSteps.tsx`; adds Storybook story with keyboard + screen-reader tests passing; commits visual regression baseline
4. Planner produces `docs/designs/AUTH-142.md` that *uses* `ProgressSteps` — no new token invention, no raw HTML
5. Test Architect produces tests at unit + component + e2e + visual tiers
6. Implementer runs the TDD Ralph loop; all tests green; emits `<promise>STORY_COMPLETE</promise>`
7. Reviewer: UI lane passes (primitives from `@/components/primitives`, tokens only, Storybook present, a11y clean, visual diff approved by human as intentional)
8. CI green; human merges; ephemeral preview env shows the real screen exactly as designed
9. Two weeks later, a human opens the shipped app in Onlook to tighten the copy and spacing — those edits land as a new PR that flows through the same pipeline

No ad-hoc hex values. No one-off buttons. No "export from Figma and hope." No manual test coverage tracking. No reliance on a single person's visual taste at midnight. The design system is the product, and the product is the design system.

---

*End of UX/UI addendum.*
