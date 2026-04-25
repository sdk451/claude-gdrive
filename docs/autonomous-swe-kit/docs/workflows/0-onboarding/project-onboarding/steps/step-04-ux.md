# Step 4 — UX Principles & Flows

**Personas:** UX Engineer (Ume) — `{project-root}/.cursor/commands/ux-engineer.md` (or `ux.md`); Architect for review.
**Inputs:** `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`
**Outputs:** `docs/ux-principles.md`, `docs/ux.md`

## Goal

Capture how this product feels to use, and the major user flows that the implementation must hit.

## Procedure

1. **Load UX Engineer persona** from `.cursor/commands/ux-engineer.md` (fall back to `ux.md` or `docs/autonomous-swe-kit/agents/ux-engineer.md`).
2. **Generate `docs/ux-principles.md`** — short (≤ 1 page). Sections:
   - Audience
   - Voice & tone (first principles)
   - Interaction principles (accessibility, latency tolerances, surface-specific notes — e.g. Cowork, Claude Code, web)
   - Error & empty states
   - Success criteria
3. **Generate `docs/ux.md`** — flows. Sections:
   - Onboarding / first-run
   - Primary flows (one subsection per top user story from the brief)
   - Edge / failure flows (auth failure, transient errors, partial data)
   - Settings / admin flows (if any)
   - Accessibility & internationalization notes
   - Open UX questions
4. **Cross-link** to the brief, PRD, architecture, and tech-stack.
5. **Append state.**

```markdown
## <ts> — step-04-ux — ux-engineer

- Status: complete
- Outputs: docs/ux-principles.md, docs/ux.md
- Significant: yes
```

## Status Menu (halt and wait)

```
UX docs ready: docs/ux-principles.md, docs/ux.md
[C] Continue to step 5 (Constitution)
[R] Revise (specify section)
[X] Stop
```

If `C`: read and follow `step-05-constitution.md`.
