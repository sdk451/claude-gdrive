# Step 1 — Initialize Onboarding

**Persona:** Orchestrator (this workflow itself)
**Inputs:** `{project-root}/docs/_seed/`, optional existing `{project-root}/docs/config.yaml`
**Outputs:** `{project-root}/docs/config.yaml` (created or validated), `{project-root}/docs/_onboarding-state.md` (created or appended)

## Goal

Confirm we know enough about the project to begin, write or validate `docs/config.yaml`, and open the append-only onboarding state log.

## Procedure

1. Check for `{project-root}/docs/_seed/`. If empty or missing, ask the user to provide at least a **requirements brief** (free-form text or a file path under `docs/_seed/`). Stop until they reply.
2. Check `{project-root}/docs/config.yaml`. If missing, create it with these keys (filled from user answers + sensible defaults):

```yaml
project_name: "<short kebab-case>"
output_folder: docs
linear_team: Tokenomik
communication_language: en
```

3. Append an entry to `docs/_onboarding-state.md` (create the file if missing) using this format:

```markdown
## YYYY-MM-DD HH:MM — step-01-init — orchestrator

- Status: started
- Notes: <one line>
```

4. Print a short status menu and wait for the user.

## Status Menu (halt and wait)

```
Onboarding initialized.
- Project: <project_name>
- Seed inputs detected: <list short names>
- Config: docs/config.yaml
Ready to generate the brief?
[C] Continue to step 2 (Analyst → docs/brief.md)
[E] Edit config first
[X] Stop
```

If `C`: append `## ... step-01-init — orchestrator\n- Status: complete` to `docs/_onboarding-state.md`, then read and follow `step-02-brief.md`.

If `E`: prompt for edits, save, ask again.

If `X`: stop without changes.
