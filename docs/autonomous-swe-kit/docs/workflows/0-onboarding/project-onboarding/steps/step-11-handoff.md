# Step 11 — Handoff to Per-Story Loop

**Persona:** Orchestrator
**Inputs:** All prior state.
**Outputs:** Final handoff note in `docs/_onboarding-state.md`; first feature story marked `Ready` in Linear if Epic 0 passed.

## Goal

Close out onboarding cleanly. Tell the user what to do next, summarize the artifacts produced, and (if Epic 0 passed) move the first feature story to `Ready`.

## Procedure

1. **Compose a handoff note** in `docs/_onboarding-state.md`:

```markdown
## <ts> — step-11-handoff — orchestrator

- Status: complete
- Brief: docs/brief.md
- PRD: docs/prd.md
- Architecture: docs/architecture.md
- Tech stack: docs/tech-stack.md
- UX: docs/ux-principles.md, docs/ux.md
- Constitution: docs/constitution.md
- Foundation: docs/environments.md, docs/observability.md, docs/test-strategy.md, docs/design-system.md
- Backlog: docs/backlog.md
- Linear project: <url>
- Epic 0 readiness: PASS|FAIL
- Significant: yes # final session-summary diary entry
```

2. **If Epic 0 passed**, move the first feature story (`S1.1`) to `Ready` in Linear with a comment "Onboarding complete; Epic 0 ready; per-story loop unblocked."
3. **Tell the user**:
   - Next per-story command: `/plan <story-id>` (or whichever planner command the kit defines).
   - Where to read the diary (only significant updates are recorded).
   - Where to read the onboarding state log.
4. **Stop.** No further steps.

## Final Status

```
Onboarding complete.
Artifacts: see docs/_onboarding-state.md.
Linear: <project url>
Next: run /plan <S1.1> to begin the first feature story.
```
