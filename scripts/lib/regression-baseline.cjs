'use strict';

/**
 * Which failures are this change's fault, and which are the repo's.
 *
 * WHY THIS EXISTS
 * ---------------
 * The gate blocked on any red run. That is right for a regression the change
 * introduced and wrong for debt it inherited, and the two were indistinguishable.
 *
 * Observed in graphene_supply, story E27-S2: the story's own progression and
 * regression targets were green, but the ledger ceiling escalated the run to
 * full scope ("13 stories merged since the last full pass"), which pulled in
 * seven cross-epic failures and a `regression-targets.txt` line broken weeks
 * earlier. The story was blocked by debt it did not create and could not fix.
 *
 * That block is self-perpetuating: the merge is what would have cleared the
 * counter, so every subsequent story hits the same wall. E27-S3 and E27-S4
 * queued behind it.
 *
 * THE RULE
 * A failure that was already failing at the last recorded baseline does not
 * block. A failure that was not, does. The escalation itself is unchanged -
 * running full scope is correct; blocking on someone else's debt is not.
 *
 * Pre-existing failures are never silent. They are named in the gate output and
 * written to the decision record, so "the suite is rotting" stays visible
 * instead of becoming a quiet allowance.
 */

const path = require('node:path');
const { readJsonState, writeJsonState } = require('./json-state.cjs');

const BASELINE_REL = 'reports/regression-baseline.json';

/** Stable identity for a failure, independent of duration or output. */
function failureKey(result) {
  return String(result && result.name ? result.name : 'unknown').trim();
}

function baselinePath(projectRoot, ledgerRootFn) {
  // Shares the ledger's home so a worktree reads the primary's baseline, for
  // the same reason the ledger does: a worktree has none of its own.
  const root = typeof ledgerRootFn === 'function' ? ledgerRootFn(projectRoot) : projectRoot;
  return path.join(root, BASELINE_REL);
}

function readBaseline(projectRoot, ledgerRootFn) {
  const parsed = readJsonState(baselinePath(projectRoot, ledgerRootFn));
  if (parsed == null) return { sha: null, at: null, scope: null, failing: [] };
  return {
    sha: parsed.sha || null,
    at: parsed.at || null,
    scope: parsed.scope || null,
    failing: Array.isArray(parsed.failing) ? parsed.failing : [],
  };
}

/**
 * Record what a FULL run found failing.
 *
 * Only full scope writes a baseline: a narrowed run did not execute the other
 * suites, so its silence about them is absence of evidence, not evidence they
 * pass. Recording a narrow run would let one story's green quietly forgive
 * everything it never ran.
 */
function writeBaseline(projectRoot, { scope, sha, results }, ledgerRootFn) {
  if (scope !== 'full') return readBaseline(projectRoot, ledgerRootFn);
  const failing = (results || [])
    .filter((r) => r && r.status === 'fail')
    .map(failureKey)
    .sort();
  const next = { sha: sha || null, at: new Date().toISOString(), scope, failing };
  return writeJsonState(baselinePath(projectRoot, ledgerRootFn), next);
}

/**
 * Split this run's failures into the ones that block and the ones that do not.
 *
 * No baseline means everything blocks. An unknown repo is not a forgiven one -
 * the same reasoning as an absent ledger escalating to full rather than
 * narrowing.
 */
function classifyFailures(results, baseline) {
  const failed = (results || []).filter((r) => r && r.status === 'fail').map(failureKey);
  const known = new Set((baseline && baseline.failing) || []);
  const blocking = failed.filter((k) => !known.has(k));
  const preExisting = failed.filter((k) => known.has(k));
  // A baseline failure that now passes: the repo got better and the baseline
  // should be tightened, or it will keep forgiving something already fixed.
  const passing = new Set(
    (results || []).filter((r) => r && r.status !== 'fail').map(failureKey),
  );
  const resolved = [...known].filter((k) => passing.has(k));
  return { blocking, preExisting, resolved };
}

module.exports = {
  BASELINE_REL,
  failureKey,
  baselinePath,
  readBaseline,
  writeBaseline,
  classifyFailures,
};
