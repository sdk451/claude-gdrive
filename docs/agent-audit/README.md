# Agent audit log (append-only)

This repo maintains an **append-only** audit log to trace autonomous execution:

- which **Cursor hooks** ran (pre/post/stop), which script, and the exit code
- which **personas** were invoked (planner / test-architect / implementer / reviewer / etc.)
- optional links to the story’s **PR** and **GitHub Actions** runs

## Files

- `docs/agent-audit/agent-audit.jsonl`: append-only log
- Local hook runner also writes a gitignored working log to `reports/agent-audit.jsonl` so normal development doesn’t constantly dirty the working tree.

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
