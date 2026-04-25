# Step 3 — Architecture, PRD, Tech Stack

**Personas:** Architect (Artemis) — `{project-root}/.cursor/commands/architect.md`. May invoke party-mode if `{config.optional.party_mode}` exists.
**Inputs:** `docs/brief.md`, `docs/_seed/`, any existing `docs/architecture.md`, `docs/tech-stack.md`, `docs/prd.md`
**Outputs:** `docs/prd.md`, `docs/architecture.md`, `docs/tech-stack.md`

## Goal

Produce or reconcile the three load-bearing technical documents the rest of the workflow depends on.

## Procedure

1. **Load the Architect persona** from `.cursor/commands/architect.md`.
2. **Read** `docs/brief.md`, all of `docs/_seed/`, and any existing PRD/architecture/tech-stack docs.
3. For each of the three outputs:
   - If the file does not exist, create it.
   - If it exists, reconcile against the brief and seed; preserve detail, fix divergence, and update frontmatter `status` and `sources`.
4. **PRD (`docs/prd.md`)** — keep these sections:
   - Overview (problem + proposed solution)
   - Goals & non-goals
   - Users & use cases
   - Scope (in / out)
   - Functional requirements (must / should)
   - Non-functional requirements
   - UX & onboarding requirements (high level — full detail goes in `docs/ux.md`)
   - Risks & mitigations
   - Acceptance criteria (per-feature or per-epic level)
   - References
5. **Architecture (`docs/architecture.md`)** — keep these sections:
   - Summary
   - Problem context
   - High-level architecture (diagram)
   - Components (with responsibilities)
   - External integrations and protocols
   - Deployment options
   - Security model
   - Key design decisions (rationale table)
   - Testing & validation strategy (high level — defers to `docs/test-strategy.md`)
6. **Tech stack (`docs/tech-stack.md`)** — keep these sections:
   - Runtime & language
   - Core frameworks / SDKs
   - Authentication & authorization
   - Data / storage
   - Observability
   - Testing tooling
   - CI/CD shape
   - Packaging / distribution
7. **Cross-link.** Each doc must link to the others in its References section.
8. **Append state** for each doc:

```markdown
## <ts> — step-03-architecture — architect

- Status: complete
- Outputs: docs/prd.md, docs/architecture.md, docs/tech-stack.md
- Significant: yes
```

## Status Menu (halt and wait)

```
Architecture documents ready:
  docs/prd.md
  docs/architecture.md
  docs/tech-stack.md
[C] Continue to step 4 (UX principles + UX flows)
[R] Revise (specify which doc)
[X] Stop
```

If `C`: read and follow `step-04-ux.md`.
