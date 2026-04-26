# Agent audit log (append-only)

This repo maintains an **append-only** audit log to trace autonomous execution:

- which **Cursor hooks** ran (pre/post/stop), which script, and the exit code
- which **personas** were invoked (planner / test-architect / implementer / reviewer / etc.)
- optional links to the story’s **PR** and **GitHub Actions** runs

## Files

- `docs/agent-audit/agent-audit.jsonl`: append-only log
- Local hook runner also writes a gitignored working log to `reports/agent-audit.jsonl` so normal development doesn’t constantly dirty the working tree.

### Why merges used to conflict — and what we do now

`main` and a long-lived story branch often **both append** to this file (and to
`docs/diary/**`) after the same merge-base. Git’s default merge then treats that
as clashing edits on the same region. This repo sets **`merge=union`** for those
paths in **`.gitattributes`**: Git’s union merge driver keeps the **union of
lines** from both parents, which matches append-only JSONL and typical diary
additions. Commit audit + diary lines on the PR branch as usual; no strip step.

**Caveat:** `merge=union` applies to Git **merge** / **merge** PR completion.
GitHub **squash** merges use a different code path; if a squash still conflicts,
merge/rebase `main` into the branch first or use a merge commit for that PR.

## Schema: `AgentAuditRecord` (v1)

Each line is a single JSON object:

```json
{
  "schema": "gdrive.agentAudit.v1",
  "timestamp": "2026-04-26T00:17:32.123Z",
  "kind": "hook",
  "hook": {
    "script": ".cursor/hooks/enforce-plan-mode.sh",
    "runner": ".cursor/hooks/run-hook.cjs",
    "phase": "preToolUse",
    "matcher": "Write|Edit",
    "exitCode": 0
  },
  "context": {
    "cwd": "c:/repos/gdrive",
    "storyId": "TOK-9",
    "branch": "TOK-9/s04-secrets-config"
  }
}
```

or:

```json
{
  "schema": "gdrive.agentAudit.v1",
  "timestamp": "2026-04-26T00:20:10.456Z",
  "kind": "persona",
  "persona": {
    "name": "implementer",
    "storyId": "TOK-9"
  },
  "context": {
    "branch": "TOK-9/s04-secrets-config",
    "prUrl": "https://github.com/ORG/REPO/pull/3",
    "actionsRunUrl": "https://github.com/ORG/REPO/actions/runs/123456789"
  }
}
```
