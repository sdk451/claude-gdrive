# Step 9 — Linear Import

**Persona:** Orchestrator
**Inputs:** `docs/backlog.md`, `docs/config.yaml` (specifically `linear_team`)
**Outputs:** Linear project + epics (parent issues) + stories (child issues) under team `Tokenomik`

## Goal

Mirror the approved backlog into Linear so feature work can be tracked outside the repo. Epic 0 must land first and be marked ready before any feature epic.

## Procedure

1. **Confirm team.** Use the Linear MCP `list_teams` tool to confirm `Tokenomik` is reachable. If not, halt and ask the user.
2. **Find or create the project.** Project name = `<project_name>` from `docs/config.yaml`. Use `save_project` (the Linear MCP tool will upsert by name when given the team).
3. **Create Epic 0** as a parent issue titled `Epic 0 — Foundation`, description = the Epic 0 section of `docs/backlog.md`. Label `epic`. Priority = high.
4. **For each Epic 0 story** (`S0.x`), create a child issue with:
   - Title: `<S0.x> <story title>`
   - Description: full story body including AC and test targets path
   - Parent: Epic 0 issue
   - Labels: `epic-0`, area-specific labels if obvious
5. **For each feature epic** (`E1`, `E2`, …), create the parent issue, then its stories. Stories should link to Epic 0 in their description if they depend on a foundation story.
6. **Status flow:** Epic 0 stories `Backlog` → `Ready`. Feature epic stories stay `Backlog` until step 10 marks Epic 0 readiness `Done`.
7. **Append state.**

```markdown
## <ts> — step-09-linear-import — orchestrator

- Status: complete
- Linear project: <id/url>
- Issues created: <count>
- Significant: yes
```

## Status Menu (halt and wait)

```
Linear import complete:
  Project: <name> (<url>)
  Epic 0: <issue id>
  Total issues created: <n>
[C] Continue to step 10 (Implementation-readiness gate)
[R] Revise (specify which issue)
[X] Stop
```

If `C`: read and follow `step-10-readiness.md`.
