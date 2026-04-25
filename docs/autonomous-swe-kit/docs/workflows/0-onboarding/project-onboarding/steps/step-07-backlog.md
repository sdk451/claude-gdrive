# Step 7 — Backlog (Epic 0 mandatory)

**Personas:** Architect, Test Architect, Platform Engineer (party mode preferred if available)
**Inputs:** All prior outputs
**Output:** `docs/backlog.md`

## Goal

Produce a complete `docs/backlog.md` with Epic 0 (Foundation) first, followed by feature epics. Each epic has stories with acceptance criteria derived from PRD requirements and architectural commitments.

## Procedure

1. **Load Architect persona.** If party mode is available (`{config.optional.party_mode}` exists), invoke it with all three personas. Otherwise run them sequentially: Architect drafts, Test Architect annotates testability, Platform Engineer validates Epic 0.
2. **Generate `docs/backlog.md`** using this template:

```markdown
---
title: Backlog — <Project Name>
status: draft
date: <YYYY-MM>
---

## Conventions

- IDs: `E<n>` for epics, `S<n>.<m>` for stories.
- Each story has: goal, acceptance criteria (Given/When/Then), test targets file, dependencies.
- Epic 0 must be ready (all stories merged) before any feature epic starts.

## Epic 0 — Foundation (mandatory)

**Goal:** Stand up the target environments, CI/CD, observability, and test architecture so feature work can ship safely.

### S0.1 — Repo & dev environment

- AC1: …
- Dependencies: none
- Test targets: `docs/tests/S0.1-targets.txt`

### S0.2 — CI pipelines (PR validation, main, release)

### S0.3 — Container build & deploy to staging

### S0.4 — Secrets & config management

### S0.5 — Observability baseline (structured logs, error tracking)

### S0.6 — Test harness (unit, integration, E2E scaffolds)

### S0.7 — Security baseline (dependency scan, secret scan)

### S0.8 — Production deploy gate

### S0.9 — Implementation-readiness gate (matches step 10 here)

## Epic 1 — <First feature epic>

**Goal:** …

### S1.1 — …

### S1.2 — …

## Epic N — …
```

3. **Cross-reference.** Each story should link to the requirement(s) from `docs/prd.md` and the architectural commitment(s) from `docs/architecture.md` it satisfies.
4. **Append state.**

```markdown
## <ts> — step-07-backlog — architect+tess+plat

- Status: complete
- Output: docs/backlog.md
- Significant: yes
```

## Status Menu (halt and wait)

```
Backlog drafted: docs/backlog.md
Epic 0 stories: <n>; feature epics: <m>; total stories: <k>
[C] Continue to step 8 (Cursor rules + AGENTS.md handoff)
[R] Revise (specify epic/story)
[X] Stop
```

If `C`: read and follow `step-08-rules-and-handoff.md`.
