---
name: project-onboarding
description: 'BMAD-style project onboarding orchestrator. Drives a project from seed inputs through brief, architecture, tech stack, UX, constitution, backlog, Linear import, Epic 0 readiness, and handoff to the per-story implementation loop. Use when the user says "onboard the project", "kick off project onboarding", or runs the `/project-onboard` command.'
config:
  project_root: "{project-root}"
  workflow_root: "{project-root}/docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding"
  config_file: "{project-root}/docs/config.yaml"
  optional:
    party_mode: "{project-root}/docs/autonomous-swe-kit/docs/workflows/party-mode/workflow.md"
    advanced_elicitation: "{project-root}/docs/autonomous-swe-kit/docs/workflows/advanced-elicitation/workflow.xml"
inputs:
  - "{project-root}/docs/_seed/"
  - "{project-root}/docs/autonomous-swe-kit/agents/"
outputs:
  - "{project-root}/docs/brief.md"
  - "{project-root}/docs/prd.md"
  - "{project-root}/docs/architecture.md"
  - "{project-root}/docs/tech-stack.md"
  - "{project-root}/docs/ux.md"
  - "{project-root}/docs/ux-principles.md"
  - "{project-root}/docs/design-system.md"
  - "{project-root}/docs/constitution.md"
  - "{project-root}/docs/backlog.md"
  - "{project-root}/docs/test-strategy.md"
  - "{project-root}/docs/environments.md"
  - "{project-root}/docs/observability.md"
  - "Linear: project + epics + stories under team `Tokenomik`"
---

# Project Onboarding Workflow (BMAD Style)

**Goal:** Take a project from seed inputs to a fully populated foundation document set, an imported Linear backlog (Epic 0 first), and a green Epic 0 implementation-readiness gate. Hand off to the per-story implementation loop only after the gate passes.

**Your role:** You are the **onboarding orchestrator**. You do not generate every artifact yourself; you load and run the named persona for each step, track state, and hand off. Personas live at `{project-root}/.cursor/commands/<name>.md` and `{project-root}/docs/autonomous-swe-kit/agents/<name>.md` — load whichever is present, prefer `.cursor/commands/` for Cursor.

---

## Workflow Architecture

This workflow follows the BMAD micro-step pattern used elsewhere in the kit:

- **One step file at a time.** Never load the next step until the current one signals continuation.
- **State tracking** in the orchestrator log (`docs/_onboarding-state.md`, append-only) and in the `stepsCompleted` frontmatter of each output document.
- **User gates** at every artifact boundary (brief, PRD, architecture, tech-stack, UX, constitution, backlog, Linear import, Epic 0 readiness). The user must select `C` (Continue) before the next step runs.
- **Persona handoff** is explicit: the orchestrator names which persona to invoke for the next step. If the user prefers `party-mode`, run the optional party-mode workflow instead, but only if `{config.optional.party_mode}` exists; otherwise fall back to sequential persona handoff.

### Path conventions

This workflow uses **repo-local paths** only:

- `docs/config.yaml` for project metadata (created by step 1 if missing).
- `docs/autonomous-swe-kit/...` for kit content.
- `docs/...` for project artifacts.
- `.cursor/commands/...` for Cursor-loaded personas and commands.

It does **not** assume an installed `_bmad/` tree. References to `_bmad/` in older kit workflows can be ignored when running this orchestrator.

### Optional sub-workflows

`party-mode` and `advanced-elicitation` are **optional**. Only invoke them if the file at `{config.optional.party_mode}` or `{config.optional.advanced_elicitation}` exists. If missing, continue with the explicit persona sequence — do not error out and do not generate placeholder paths.

---

## Step Index

| #   | File                                 | Persona / Mode                                                 | Output                                                                                            |
| --- | ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `steps/step-01-init.md`              | Orchestrator                                                   | `docs/config.yaml`, `docs/_onboarding-state.md`                                                   |
| 2   | `steps/step-02-brief.md`             | Analyst (Mara)                                                 | `docs/brief.md`                                                                                   |
| 3   | `steps/step-03-architecture.md`      | Architect (Artemis)                                            | `docs/prd.md`, `docs/architecture.md`, `docs/tech-stack.md`                                       |
| 4   | `steps/step-04-ux.md`                | UX Engineer (Ume) + Architect                                  | `docs/ux-principles.md`, `docs/ux.md`                                                             |
| 5   | `steps/step-05-constitution.md`      | Architect                                                      | `docs/constitution.md`                                                                            |
| 6   | `steps/step-06-foundation-docs.md`   | Platform Engineer (Plat) + Test Architect (Tess) + UX Engineer | `docs/environments.md`, `docs/observability.md`, `docs/test-strategy.md`, `docs/design-system.md` |
| 7   | `steps/step-07-backlog.md`           | Architect + Test Architect + Platform Engineer                 | `docs/backlog.md` (Epic 0 mandatory)                                                              |
| 8   | `steps/step-08-rules-and-handoff.md` | Orchestrator                                                   | `.cursor/rules/01..10`, `AGENTS.md`                                                               |
| 9   | `steps/step-09-linear-import.md`     | Orchestrator                                                   | Linear project + epics + stories under team `Tokenomik`                                           |
| 10  | `steps/step-10-readiness.md`         | Test Architect + Platform Engineer                             | Epic 0 readiness gate (uses `check-implementation-readiness` workflow)                            |
| 11  | `steps/step-11-handoff.md`           | Orchestrator                                                   | Handoff note + Linear status; per-story loop unblocked                                            |

---

## Initialization Sequence

1. **Read this file completely** before invoking any step.
2. **Resolve config.** Read `{config.config_file}`. If absent, step 1 creates a minimal one. Required keys: `project_name`, `output_folder` (default `docs`), `linear_team` (default `Tokenomik`), `communication_language` (default `en`).
3. **Open the state log.** Append a `Started` entry to `docs/_onboarding-state.md` with timestamp, persona, and step id.
4. **Run step 1.** Read `steps/step-01-init.md` fully and follow it.

## Critical Rules (no exceptions)

- Never load multiple step files simultaneously.
- Never skip a step — even if its output already exists. If an output exists, the step's job becomes "review and reconcile".
- Never push to Linear before the user approves `docs/backlog.md`.
- Never claim Epic 0 is ready without running `check-implementation-readiness` from step 10.
- Halt at every menu and wait for `C` (Continue) before proceeding.

---

## Execution

Read fully and follow `steps/step-01-init.md`.
