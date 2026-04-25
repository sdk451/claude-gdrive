# Step 8 — Cursor Rules & AGENTS.md Handoff

**Persona:** Orchestrator (this workflow)
**Inputs:** All foundation docs.
**Outputs:** `.cursor/rules/01-constitution.mdc`, `02-architecture.mdc`, `03-tech-stack.mdc`, `04-infra.mdc`, `05-design-system.mdc`, `10-testing.mdc`; `AGENTS.md`

## Goal

Materialize the lightweight, always-on / scoped Cursor rules promised by `.cursor/rules/00-index.mdc`, and create `AGENTS.md` for non-Cursor tooling. Each rule must be short (≤ 30 lines body) and link to the canonical doc rather than duplicating it.

## Procedure

1. **Read** `.cursor/rules/00-index.mdc` to confirm intended scopes.
2. For each rule, write a `.mdc` file with this shape:

```markdown
---
description: <one line>
alwaysApply: true # or false for scoped
globs: # only when alwaysApply: false
  - <pattern>
---

# <Title>

Source of truth: [docs/<file>.md](../../docs/<file>.md)

- <bullet 1: principle in one line>
- <bullet 2>
- <bullet 3>
```

3. **Mapping:**
   - `01-constitution.mdc` → always on, sources `docs/constitution.md`
   - `02-architecture.mdc` → always on, sources `docs/architecture.md`
   - `03-tech-stack.mdc` → always on, sources `docs/tech-stack.md`
   - `04-infra.mdc` → scoped to `infra/**`, sources `docs/environments.md` + `docs/observability.md`
   - `05-design-system.mdc` → scoped to `components/**` and `**/*.tsx`, sources `docs/design-system.md`
   - `10-testing.mdc` → scoped to `tests/**` and `**/*.test.*`, sources `docs/test-strategy.md`
4. **Write `AGENTS.md`** at repo root: a plain Markdown summary that points non-Cursor tools (Claude Code, Aider, etc.) to:
   - Constitution: `docs/constitution.md`
   - Architecture: `docs/architecture.md`
   - Tech stack: `docs/tech-stack.md`
   - Test strategy: `docs/test-strategy.md`
   - Story loop: `docs/autonomous-swe-kit/autonomous-swe-design.md`
   - Diary: only end-of-session/workflow summaries and significant doc updates (mirror the throttle).
   - Linear: team `Tokenomik`, project per repo.
5. **Append state.**

```markdown
## <ts> — step-08-rules-and-handoff — orchestrator

- Status: complete
- Outputs: .cursor/rules/\*.mdc, AGENTS.md
- Significant: no
```

## Status Menu (halt and wait)

```
Rules and AGENTS.md created.
[C] Continue to step 9 (Linear import)
[R] Revise
[X] Stop
```

If `C`: read and follow `step-09-linear-import.md`.
