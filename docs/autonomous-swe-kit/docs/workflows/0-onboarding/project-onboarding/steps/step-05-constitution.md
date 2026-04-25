# Step 5 — Project Constitution

**Persona:** Architect (Artemis); reviewer: Reviewer (Rev) if available
**Inputs:** `docs/brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/tech-stack.md`, `docs/ux-principles.md`
**Output:** `docs/constitution.md`

## Goal

Distill the non-negotiable principles that bound every implementation choice. Short, declarative, durable. The Cursor rule `01-constitution.mdc` will mirror this file.

## Procedure

1. **Load Architect persona.**
2. Read all input documents.
3. Generate `docs/constitution.md` with these sections (≤ 1 page):

```markdown
---
title: Project Constitution — <Project Name>
status: ratified
date: <YYYY-MM>
---

## Mission

One paragraph.

## Principles (numbered, declarative)

1. <e.g. "Per-user OAuth, never service-account access.">
2. ...

## Non-negotiables (security, privacy, compliance)

- <e.g. "No secrets in logs, ever.">

## Definition of Done (project level)

- Spec → tests → implementation → review → diary → Linear closure.

## Amendment Process

How changes to this document are proposed and approved.
```

4. **Append state.**

```markdown
## <ts> — step-05-constitution — architect

- Status: complete
- Output: docs/constitution.md
- Significant: yes
```

## Status Menu (halt and wait)

```
Constitution ratified: docs/constitution.md
[C] Continue to step 6 (Foundation docs: environments, observability, test strategy, design system)
[R] Revise
[X] Stop
```

If `C`: read and follow `step-06-foundation-docs.md`.
