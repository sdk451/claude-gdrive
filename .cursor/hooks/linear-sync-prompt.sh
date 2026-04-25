#!/usr/bin/env bash
# Stop-hook nudge — autonomous-mode only.
#
# When the implementer's autonomous loop is active for the current story
# (`.cursor/autonomous-mode.txt` exists and lists the same STORY_ID as the
# branch) and there are commits on this branch that have not been recorded on
# the matching Linear issue, emit a followup_message asking the agent to post
# a Linear comment via the plugin-linear-linear MCP (save_comment) for each,
# then append the short hash to .cursor/linear-synced.txt to mark it synced.
#
# Manual commits — i.e. work made outside the autonomous loop — do NOT trigger
# Linear comments. This matches the project rule: Linear gets updates for
# autonomous-loop story work only (rules 11-linear-sync.mdc and
# 12-autonomous-mode.mdc).
#
# The hook never calls Linear's API directly — it keeps the existing
# agent-via-MCP pattern so no Linear API token is required in the environment.
# Silent when not in autonomous mode, when nothing is pending, or on non-story
# branches. Capped at 5 nudges per stop chain to avoid runaway loops.

INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
if [ "$LOOP" -ge 5 ]; then echo '{}'; exit 0; fi

BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
if [ -z "$STORY_ID" ]; then echo '{}'; exit 0; fi

# Autonomous-mode gate. The marker file's first ABC-123 token must match the
# branch's STORY_ID, otherwise we're not in autonomous mode for this work and
# Linear sync is the agent's manual responsibility (or skipped entirely).
AUTO_FILE=".cursor/autonomous-mode.txt"
if [ ! -s "$AUTO_FILE" ]; then echo '{}'; exit 0; fi
AUTO_STORY=$(grep -m 1 -oE '[A-Z]+-[0-9]+' "$AUTO_FILE" 2>/dev/null)
if [ "$AUTO_STORY" != "$STORY_ID" ]; then echo '{}'; exit 0; fi

# Determine the branch base. Prefer the configured upstream's merge-base, fall
# back to common defaults. Bail silently if none resolves (e.g. detached HEAD).
BASE=""
for ref in "@{upstream}" origin/main main origin/master master; do
  if MB=$(git merge-base HEAD "$ref" 2>/dev/null); then
    BASE="$MB"
    break
  fi
done
if [ -z "$BASE" ]; then echo '{}'; exit 0; fi

LEDGER=".cursor/linear-synced.txt"
mkdir -p .cursor
[ ! -f "$LEDGER" ] && : > "$LEDGER"

# Chronological list of commits on this branch since the base.
COMMITS=$(git log --reverse --format='%h%x09%s' "${BASE}..HEAD" 2>/dev/null)
if [ -z "$COMMITS" ]; then echo '{}'; exit 0; fi

# Filter out commits already recorded in the ledger. We match the short hash as
# a fixed string against entire ledger lines so a future ledger format extension
# (e.g. `<hash> <iso-timestamp>`) keeps working.
PENDING=$(printf '%s\n' "$COMMITS" | while IFS=$'\t' read -r h s; do
  if ! awk -v h="$h" '$1 == h { found = 1 } END { exit !found }' "$LEDGER" 2>/dev/null; then
    printf '%s\t%s\n' "$h" "$s"
  fi
done)

if [ -z "$PENDING" ]; then echo '{}'; exit 0; fi

PENDING_LIST=$(printf '%s\n' "$PENDING" | sed 's/^/  - /')
COUNT=$(printf '%s\n' "$PENDING" | grep -c .)

read -r -d '' MSG <<EOF || true
Linear sync pending (autonomous mode for $STORY_ID): $COUNT commit(s) on branch "$BRANCH" are not yet recorded on the Linear issue.

Pending (short hash → subject):
$PENDING_LIST

For each entry:
  1. Call plugin-linear-linear.save_comment with issueId="$STORY_ID" and a markdown body summarising the commit (short hash, subject, files / dirs touched, verification status — typecheck/lint/test if relevant).
  2. After save_comment succeeds, append the short hash on its own line to .cursor/linear-synced.txt (the local ledger this hook reads).

If this is the final commit closing the story (STORY_COMPLETE + targeted suite green), also:
  3. Push the branch (\`git push -u origin HEAD\`).
  4. Open or update a PR (\`gh pr create\`/\`gh pr edit\`) with auto-merge enabled (\`gh pr merge --auto --squash\`) — the autonomous loop runs without human review; CI is the gate.
  5. Move the Linear issue to "In Review" (or "Done" if the PR has already merged) via plugin-linear-linear.save_issue {id:"$STORY_ID", state:"In Review"}.
  6. Clear the autonomous marker: \`scripts/autonomous-stop.sh\`.

Once every pending hash is in the ledger, finish the turn — the hook will exit silently next time. See .cursor/rules/11-linear-sync.mdc and .cursor/rules/12-autonomous-mode.mdc for the full contract.
EOF

jq -n --arg msg "$MSG" '{followup_message: $msg}'
exit 0
