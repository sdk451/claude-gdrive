#!/usr/bin/env bash
# Run every Linear-story targets file (docs/tests/TOK-*-targets.txt) so main-line
# regression re-executes each story's declared Vitest slice. Skips missing files.
# Logs to reports/regression-story-targets.log for the human-readable summary.

set -euo pipefail

REPORT_DIR="reports"
LOG="${REPORT_DIR}/regression-story-targets.log"
mkdir -p "$REPORT_DIR"
: > "$LOG"

shopt -s nullglob
FILES=(docs/tests/TOK-*-targets.txt)
shopt -u nullglob

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No docs/tests/TOK-*-targets.txt files found." | tee -a "$LOG"
  exit 0
fi

for f in "${FILES[@]}"; do
  echo "" | tee -a "$LOG"
  echo "========== $(date -u +"%Y-%m-%dT%H:%M:%SZ")  $f  ==========" | tee -a "$LOG"
  bash scripts/run-targeted-tests.sh "$f" 2>&1 | tee -a "$LOG"
done

echo "" | tee -a "$LOG"
echo "[run-regression-story-targets] ALL STORY TARGET FILES GREEN" | tee -a "$LOG"
