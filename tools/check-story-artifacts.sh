#!/usr/bin/env bash
# check-story-artifacts.sh — enforce story artefacts on feature/<story-id>-* PR branches.
#
# Usage:
#   BRANCH_NAME="$GITHUB_HEAD_REF" PR_NUMBER="$PR" bash tools/check-story-artifacts.sh
#   bash tools/check-story-artifacts.sh                 # full gate (pre-merge / epic close)
#   bash tools/check-story-artifacts.sh --phase spec    # step-5 EXIT GATE: design + plan only
#
# --phase spec is the story-loop's own checkpoint. It runs after the planner and
# test-architect have produced the design and test plan, BEFORE the coder starts,
# so a story cannot be coded against artefacts that do not exist. The full gate
# still runs later as the pre-merge backstop; this is the checkpoint that stops
# the gap being paid for. Without it, a missing design was invisible until epic
# close - a dozen stories of code built on an unspecified change (DF-BUG-6).
#
# Skip:
#   SKIP_STORY_ARTIFACT_GATE=1  — emergency bypass (do not use on story PRs)
#
set -euo pipefail

PHASE="full"
if [[ "${1:-}" == "--phase" ]]; then
  PHASE="${2:-full}"
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if [[ "${SKIP_STORY_ARTIFACT_GATE:-0}" == "1" ]]; then
  echo "Story artefact gate: SKIP_STORY_ARTIFACT_GATE=1 — skipped."
  exit 0
fi

branch="${BRANCH_NAME:-${GITHUB_HEAD_REF:-}}"
if [[ -z "$branch" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
fi

# Only enforce Autonomous-style branches: feature/E4-S1-slug (story id = Ex-Sy)
if [[ ! "$branch" =~ ^feature/(E[0-9]+-S[0-9]+)- ]]; then
  echo "Story artefact gate: skip (branch '${branch:-empty}' does not match feature/<story-id>-...)"
  exit 0
fi

STORY="${BASH_REMATCH[1]}"
REQ="project/requirements/${STORY}.md"
DESIGN="docs/designs/${STORY}.md"
PLAN="docs/tests/${STORY}.md"
TARGETS="docs/tests/${STORY}-targets.txt"
REPORT="docs/tests/${STORY}-test-report.md"

fail() { echo "Story artefact gate FAILED: $*" >&2; exit 1; }

if [[ "$PHASE" == "spec" ]]; then
  # The step-5 exit gate: the coder's inputs must exist before it starts. The
  # test report does not yet - it is written after the slices - so it is not
  # checked here. TARGETS likewise appears during coding.
  for f in "$REQ" "$DESIGN" "$PLAN"; do
    [[ -f "$f" ]] || fail "spec-phase artefact missing before coding can start: $f"
  done
  echo "Story artefact gate (spec phase): $STORY design and test plan present — coder may start."
  exit 0
fi

for f in "$REQ" "$DESIGN" "$PLAN" "$TARGETS" "$REPORT"; do
  [[ -f "$f" ]] || fail "missing required file: $f"
done

_REPORT="$(tr -d '\r' < "$REPORT" | sed '1s/^\xEF\xBB\xBF//')"

# Lightweight markdown shape checks on the test report (auditable trail).
echo "$_REPORT" | grep -qE '^# Story test report( — |:)' || fail "$REPORT must start with '# Story test report —' (or ':')"

if echo "$_REPORT" | grep -qE '<(story-id|short title|paste from requirements|path or describe|tier|fixtures|ISO8601|PR URL|N|CLI excerpt|what behaviour|none \| fixture name \| mock|route / API|first behavior slice|external APIs|project-owned modules|failing command|passing command|what changed|command and evidence)>'; then
  fail "$REPORT still contains template placeholders"
fi

for heading in "Execution summary" "Test architecture review" "TDD cycle log" "Post-green refactor review" "Acceptance criteria coverage" "Test execution log" "Regression membership"; do
  echo "$_REPORT" | grep -q "^## ${heading}" || fail "$REPORT missing section '## ${heading}'"
done

# Must contain at least one table cell PASS, FAIL, or SKIP (auditable outcomes).
echo "$_REPORT" | grep -qE '^ *\|.*\| *(PASS|FAIL|SKIP) *\|' \
  || fail "$REPORT must include at least one Markdown table row with PASS, FAIL, or SKIP"

# Must show acceptance criteria mapping and both progression/regression evidence.
echo "$_REPORT" | grep -qE '\bAC-[0-9]+\b' \
  || fail "$REPORT must map acceptance criteria using AC-n refs"

echo "$_REPORT" | grep -qiE 'tracer bullet|tracer' \
  || fail "$REPORT must identify the tracer bullet behavior"

echo "$_REPORT" | grep -qE '\|[[:space:]]*(PASS|FAIL)[[:space:]]*\|.*Horizontal-slicing|Horizontal-slicing.*\|[[:space:]]*(PASS|FAIL)[[:space:]]*\|' \
  || fail "$REPORT must record the horizontal-slicing check"

echo "$_REPORT" | grep -qiE '\|[[:space:]]*progression[[:space:]]*\|' \
  || fail "$REPORT must include progression test evidence"

echo "$_REPORT" | grep -qiE '\|[[:space:]]*regression[[:space:]]*\|' \
  || fail "$REPORT must include regression test evidence or membership"

echo "$_REPORT" | grep -qE '\|[[:space:]]*yes[[:space:]]*\|' \
  || fail "$REPORT Regression membership must list at least one target as yes"

# When running inside a pull_request workflow, require an explicit PR reference in the report body.
if [[ -n "${PR_NUMBER:-}" ]]; then
  if ! echo "$_REPORT" | grep -qF "pull/${PR_NUMBER}" && ! echo "$_REPORT" | grep -qF "#${PR_NUMBER}"; then
    fail "$REPORT must reference this PR (e.g. pull/${PR_NUMBER} or #${PR_NUMBER}). Update after gh pr create."
  fi
fi

echo "Story artefact gate: OK for ${STORY} (branch ${branch})"
