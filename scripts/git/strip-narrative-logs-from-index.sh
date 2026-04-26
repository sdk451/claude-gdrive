#!/usr/bin/env bash
# Drop diary + agent-audit from the next commit on story branches so PRs stay
# merge-clean. Run before `git commit` in the autonomous / implementer loop
# when not on main (see .cursor/commands/autonomous.md).
#
# Restores tracked narrative paths to HEAD in the index and working tree so
# local diary-append / manual edits do not ride on feature commits — those
# updates land on main only (merge, or direct commits on main).

set -euo pipefail

branch=$(git branch --show-current 2>/dev/null || true)
if [ -z "$branch" ] || [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  exit 0
fi

paths=(docs/diary docs/agent-audit/agent-audit.jsonl)
for p in "${paths[@]}"; do
  if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
    git restore --staged -- "$p" 2>/dev/null || true
    git restore --source=HEAD --worktree -- "$p" 2>/dev/null || true
  fi
done

exit 0
