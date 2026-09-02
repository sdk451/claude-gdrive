'use strict';

/**
 * What the last run did, so the next one need not repeat it.
 *
 * A partner-api suite ran to 60% in a 900s window and was cut off. The retry
 * started from zero and re-paid that 60% to reach the same point. The same waste
 * appears after a single failure: verifying one fix re-runs everything that
 * already passed.
 *
 * So per-target outcomes are recorded, and two options use them:
 *
 *   --resume       run what did not pass last time
 *   --failed-only  run only what failed last time
 *
 * THE FINGERPRINT IS THE WHOLE SAFETY
 * -----------------------------------
 * A recorded pass is only meaningful for the code it passed against. If the tree
 * has changed, every prior result is stale and resuming would report a pass for
 * a target that never ran against this code - which is the "green gate that ran
 * nothing" defect with extra steps.
 *
 * So state carries a fingerprint of HEAD plus the working tree, and resume
 * refuses when it does not match. Refusing is not an inconvenience to be
 * overridden lightly: the whole value of a resumed run is that the skipped part
 * is genuinely known to pass.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const STATE_VERSION = 1;

function statePath(projectRoot) {
  return path.join(projectRoot, 'reports', 'last-run.json');
}

function sh(cmd, projectRoot) {
  const r = spawnSync(cmd, { shell: true, cwd: projectRoot, encoding: 'utf8', timeout: 30_000 });
  return r.status === 0 ? String(r.stdout).trim() : '';
}

/**
 * HEAD plus the dirty state of the tree.
 *
 * `git status --porcelain` covers uncommitted edits, which is the common case
 * mid-slice: the commit has not moved and the code has.
 */
function fingerprint(projectRoot) {
  const head = sh('git rev-parse HEAD', projectRoot) || 'no-head';
  const dirty = sh('git status --porcelain', projectRoot);
  return crypto.createHash('sha256').update(`${head}\n${dirty}`, 'utf8').digest('hex').slice(0, 16);
}

function loadState(projectRoot) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(projectRoot), 'utf8'));
    return s && s.version === STATE_VERSION ? s : null;
  } catch {
    return null;
  }
}

function saveState(projectRoot, results, fp) {
  const state = {
    version: STATE_VERSION,
    fingerprint: fp,
    at: new Date().toISOString(),
    targets: Object.fromEntries(results.map((r) => [r.name, r.status])),
  };
  fs.mkdirSync(path.dirname(statePath(projectRoot)), { recursive: true });
  fs.writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2) + '\n');
  return state;
}

/**
 * Which targets to run this time.
 *
 * @returns {{run: string[], skipped: string[], reason: string, resumed: boolean}}
 */
function planFromState(allTargets, state, fp, mode) {
  if (mode !== 'resume' && mode !== 'failed-only') {
    return { run: [...allTargets], skipped: [], reason: 'full run', resumed: false };
  }
  if (!state) {
    return { run: [...allTargets], skipped: [], reason: 'no previous run recorded; running everything', resumed: false };
  }
  if (state.fingerprint !== fp) {
    /*
     * The tree moved. Every recorded pass belongs to different code, and
     * skipping on the strength of it would report a pass for a target that never
     * ran against what is here now.
     */
    return {
      run: [...allTargets],
      skipped: [],
      reason: 'the tree has changed since the last run, so prior results do not apply; running everything',
      resumed: false,
    };
  }

  const passed = new Set(Object.entries(state.targets).filter(([, s]) => s === 'pass').map(([n]) => n));
  const failed = new Set(Object.entries(state.targets).filter(([, s]) => s === 'fail' || s === 'error').map(([n]) => n));

  if (mode === 'failed-only') {
    const run = allTargets.filter((t) => failed.has(t));
    return {
      run,
      skipped: allTargets.filter((t) => !failed.has(t)),
      reason: run.length ? `only the ${run.length} target(s) that failed last time` : 'nothing failed last time',
      resumed: true,
    };
  }
  // resume: anything not known to have passed, including targets never reached
  const run = allTargets.filter((t) => !passed.has(t));
  return {
    run,
    skipped: allTargets.filter((t) => passed.has(t)),
    reason: `${run.length} target(s) not known to pass; ${allTargets.length - run.length} skipped`,
    resumed: true,
  };
}

module.exports = { fingerprint, loadState, saveState, planFromState, statePath, STATE_VERSION };
