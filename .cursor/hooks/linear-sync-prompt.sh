#!/usr/bin/env bash
# Stop-hook nudge: when commits exist on the current story branch that have
# not been recorded on the matching Linear issue, emit a followup_message
# asking the agent to post a Linear comment via the plugin-linear-linear MCP
# (save_comment) for each, then append the short hash to .cursor/linear-synced.txt
# to mark it synced.
#
# The hook never calls Linear's API directly — it keeps the existing agent-via-MCP
# pattern so no Linear API token is required in the environment. Silent when
# nothing is pending; capped at 5 nudges per stop chain to avoid runaway loops.

INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
if [ "$LOOP" -ge 5 ]; then echo '{}'; exit 0; fi

BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
if [ -z "$STORY_ID" ]; then echo '{}'; exit 0; fi

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
Linear sync pending: $COUNT commit(s) on branch "$BRANCH" (story $STORY_ID) are not yet recorded on the Linear issue.

Pending (short hash → subject):
$PENDING_LIST

For each entry:
  1. Call plugin-linear-linear.save_comment with issueId="$STORY_ID" and a markdown body summarising the commit (short hash, subject, files / dirs touched, verification status — typecheck/lint/test if relevant).
  2. After save_comment succeeds, append the short hash on its own line to .cursor/linear-synced.txt (the local ledger this hook reads).

Once every pending hash is in the ledger, finish the turn — the hook will exit silently next time. See .cursor/rules/11-linear-sync.mdc for the full contract.
EOF

jq -n --arg msg "$MSG" '{followup_message: $msg}'
exit 0
