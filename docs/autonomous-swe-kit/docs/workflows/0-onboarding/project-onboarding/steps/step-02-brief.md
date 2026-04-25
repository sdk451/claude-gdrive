# Step 2 — Generate Project Brief

**Persona:** Analyst (Mara) — `{project-root}/.cursor/commands/analyst.md`
**Inputs:** `{project-root}/docs/_seed/*`, especially `requirements-brief.md` if present
**Output:** `{project-root}/docs/brief.md`

## Goal

Produce `docs/brief.md` — a single-source brief that downstream personas (Architect, UX Engineer, Test Architect, Platform Engineer) can rely on. Reconcile with any existing `docs/prd.md`.

## Procedure

1. **Load the Analyst persona.** Read `{project-root}/.cursor/commands/analyst.md` fully. Adopt the persona, voice, and capabilities described.
2. **Read all seed inputs** under `docs/_seed/`. Read existing `docs/prd.md` if it exists.
3. **Synthesize `docs/brief.md`** with this structure (frontmatter + sections):

```markdown
---
title: Project Brief — <Project Name>
project: <project_name>
date: <YYYY-MM>
status: draft
sources:
  - docs/_seed/requirements-brief.md
  - docs/prd.md # if present
---

## 1. Problem & Motivation

## 2. Vision & Goals

## 3. Non-Goals

## 4. Primary Users & Use Cases

## 5. Key Functional Capabilities (high level)

## 6. Constraints & Dependencies

## 7. Success Metrics

## 8. Risks (top 5)

## 9. Open Questions

## 10. References
```

4. **Reconcile with PRD.** If `docs/prd.md` exists, add a final section "Reconciliation with PRD" listing any divergence and noting which document is authoritative for which concern (the brief is authoritative on intent and motivation; the PRD is authoritative on functional requirements).
5. **Append state.** Write to `docs/_onboarding-state.md`:

```markdown
## <ts> — step-02-brief — analyst

- Status: complete
- Output: docs/brief.md
- Significant: yes # triggers diary entry
```

## Status Menu (halt and wait)

```
Brief generated: docs/brief.md
[C] Continue to step 3 (Architect → PRD/architecture/tech stack reconciliation)
[R] Revise brief (provide feedback)
[X] Stop
```

If `C`: read and follow `step-03-architecture.md`.
