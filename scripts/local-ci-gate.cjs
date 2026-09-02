#!/usr/bin/env node
/**
 * local-ci-gate.cjs — the "earn your GitHub Actions minutes" gate.
 *
 * The kit's CI economics rule (.cursor/rules/51-ci-economics.mdc): do not push a
 * branch and burn GitHub Actions runners until the change builds and passes the
 * full test stack LOCALLY against a local Docker build / Testcontainers. Only
 * then is it worth spending CI minutes pushing toward staging/production.
 *
 * This gate:
 *   1. Detects docs-only diffs and passes instantly (no build, no CI needed).
 *   2. Builds the local Docker image / brings up the local compose stack if present.
 *   3. Runs the full local suite (scripts/run-all-tests.cjs — unit/integration/
 *      api/e2e/visual/a11y + regression targets).
 *   4. Runs the story-artefact gate (tools/check-story-artifacts.sh) for feature/Ex-Sy
 *      branches. While GitHub CI is deferred (CI economics — see scripts/ci-phase.cjs),
 *      pr-ci.yml never runs, so this is the only place the artefact gate is enforced.
 *   5. Runs scripts/infra-conformance.cjs when the project ships one (Terraform/infra
 *      repos), so the conformance phase is part of the gate rather than a script nobody
 *      invokes.
 *   6. Writes reports/local-ci-gate.json stamped with the current HEAD sha, so the
 *      Implementer can prove the gate was green for the exact commit it pushes.
 *
 * Usage:
 *   node scripts/local-ci-gate.cjs [--base <ref>] [--no-docker] [--allow-skips]
 *                                 [--verify <sha>] [--strict]
 *
 * Exit 0 = safe to push (gate green or docs-only). Exit 1 = do NOT push.
 *
 * --verify <sha>  : don't run anything; just confirm a green marker exists for <sha>.
 * --strict        : treat any skipped gate as a failure (both when running and verifying).
 * --allow-skips   : forwarded to infra-conformance so a partial conformance phase is
 *                   accepted; the concession is recorded in the marker.
 *
 * SKIPPED GATES ARE RECORDED, NOT FORGOTTEN. Several steps here degrade gracefully —
 * no Docker, no bash, an opt-out env var. Each of those used to `return` straight past
 * the check, and the run still ended at pass('full local suite green'), writing a marker
 * that said so. `--verify` then read that marker and reported the commit green. The
 * marker now carries a `skipped[]` array, every skip lands in it, and both the banner
 * and --verify enumerate it — so a half-run can still be accepted, but it can no longer
 * be mistaken for a full one.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();

/**
 * Every gate this run did NOT execute, with the reason. Written into the marker so the
 * push-time proof records its own holes; `--strict` turns any entry here into a failure.
 * Declared ahead of the host-lock loading below so a failed lock load can be recorded
 * as a skip too, instead of only a console warning nothing else remembers.
 * @type {{gate: string, reason: string}[]}
 */
const skipped = [];
function noteSkip(gate, reason) {
  skipped.push({ gate, reason });
  console.warn(`[local-ci-gate] SKIPPED: ${gate} — ${reason}`);
}

// -- host serialisation -------------------------------------------------------
// Several repos may share one Docker daemon on a developer workstation. Reaper
// ownership rules stop them destroying each other's containers; they do not stop
// them all RUNNING at once. Each runner sizes its worker pool to the host core
// count, assuming it owns the machine, so N gates ask for N times the cores. The
// resulting CPU starvation makes container startup waits and test timeouts fail
// non-deterministically -- flaky red gates that look like code defects.
// See docs/local-ci-environment.md.
//
// Resolved from the root node_modules or tools/ci, because a private git
// dependency in the root manifest breaks any image build that copies the repo
// and installs: slim bases have no git binary and no credentials.
//
// A missing package degrades to running WITHOUT the lock rather than blocking
// local CI: the gate's job is to gate tests, not to enforce its own tooling.
let withLock = async (_repo, fn) => fn();
let runnerEnv = () => ({});
let lockRepoId = path.basename(ROOT);
let lockLoaded = false;
for (const lockBase of [ROOT, path.join(ROOT, 'tools', 'ci')]) {
  try {
    const R = (m) => require(require.resolve(m, { paths: [lockBase] }));
    withLock = R('@tokenomik/local-ci-gate/hostlock').withLock;
    runnerEnv = R('@tokenomik/local-ci-gate/concurrency').runnerEnv;
    // The installer stamps a real repoId into gate.config.json; "CHANGEME-repo-id" is
    // its un-stamped sentinel, not a usable identity — falling through to it here would
    // let every un-stamped repo on the host collide on the same lock key.
    const configuredRepoId = (R('@tokenomik/local-ci-gate').config || {}).repoId;
    if (configuredRepoId && configuredRepoId !== 'CHANGEME-repo-id') lockRepoId = configuredRepoId;
    lockLoaded = true;
    break;
  } catch { /* try the next location */ }
}
if (!lockLoaded) {
  noteSkip(
    'host-lock',
    '@tokenomik/local-ci-gate not installed — running WITHOUT the host lock; concurrent ' +
      'runs in other repos may contend for CPU and Docker',
  );
}

const MARKER = path.join(ROOT, 'reports', 'local-ci-gate.json');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(name);
const STRICT = process.argv.includes('--strict');
// Forwarded to run-all-tests.cjs so one gate invocation covers the story-scope
// run as well; see the runner invocation below.
const scopeArg = arg('--scope');
const storyArg = arg('--story');

function sh(cmd, opts = {}) {
  return spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', ...opts });
}

function headSha() {
  const r = sh('git rev-parse HEAD');
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The merge base to diff against — the repo's default branch, not a hardcoded `main`. */
function defaultBase() {
  // origin/HEAD is a symbolic ref to the remote default branch (e.g. "origin/main").
  const sym = sh('git symbolic-ref --quiet --short refs/remotes/origin/HEAD');
  if (sym.status === 0 && sym.stdout.trim()) return sym.stdout.trim();
  for (const cand of ['origin/main', 'origin/master']) {
    if (sh(`git show-ref --verify --quiet refs/remotes/${cand}`).status === 0) return cand;
  }
  return 'origin/main';
}

function exists(...p) {
  return fs.existsSync(path.join(ROOT, ...p));
}

/** Files that never affect runtime behaviour — a diff of only these needs no CI. */
function isDocsOnly(base) {
  // Consider BOTH committed changes (base...HEAD) AND the working tree
  // (uncommitted + staged + untracked). The old version looked only at
  // base...HEAD, so running the gate on a docs story BEFORE committing saw an
  // empty diff, returned false, and ran the entire suite - which is exactly how
  // a single new markdown file pulled a session into venv/PATH debugging.
  //
  // The safety property that must hold: docs-only is claimed only when EVERY
  // changed file, in either set, is doc-like. One code file anywhere - committed
  // or not - means the full gate runs. Widening the set can only ever ADD files
  // to the check, never remove them, so it cannot weaken the gate for code.
  const committed = sh(`git diff --name-only ${base}...HEAD`);
  if (committed.status !== 0) return false;

  // Working tree vs HEAD: staged + unstaged. `--` guards against a path that
  // looks like a revision. Untracked files are added explicitly below.
  const worktree = sh('git diff --name-only HEAD --');
  const staged = sh('git diff --name-only --cached --');
  const untracked = sh('git ls-files --others --exclude-standard');

  const files = [committed, worktree, staged, untracked]
    .filter((r) => r.status === 0)
    .flatMap((r) => r.stdout.split(/\r?\n/))
    .map((f) => f.trim())
    .filter(Boolean);

  // No changes anywhere is NOT docs-only - there is nothing to fast-path, and a
  // gate run on a pristine tree should fall through to its normal behaviour.
  if (!files.length) return false;

  const docLike = (f) =>
    /\.(md|mdx|mdc|txt|rst|adoc)$/i.test(f) ||
    f.startsWith('docs/') ||
    /(^|\/)(LICENSE|CODEOWNERS|\.gitignore|\.editorconfig)$/i.test(f);
  return files.every(docLike);
}

function writeMarker(status, extra) {
  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  fs.writeFileSync(
    MARKER,
    JSON.stringify(
      { status, sha: headSha(), finishedAt: new Date().toISOString(), skipped, ...extra },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

/**
 * Best-effort cleanup of stray testcontainers / orphaned test processes.
 *
 * This used to live in a `finally` wrapped around main()'s try block, on the
 * assumption that pass()/blockFail()/blockError() below would return and let
 * the finally run before the process actually exited. They don't: each calls
 * process.exit() directly, which — unlike a normal return or throw — tears
 * the process down immediately without unwinding to any pending `finally`.
 * So the reaper never ran, on any exit path, ever. Calling it explicitly here,
 * before the exit it precedes, is what actually gets it to run.
 */
function reapTestHygiene() {
  const hygiene = path.join(ROOT, 'scripts', 'reap-test-hygiene.cjs');
  if (fs.existsSync(hygiene)) {
    console.log('[local-ci-gate] reaping testcontainers / orphan test processes…');
    sh(`node "${hygiene}"`, { stdio: 'inherit' });
  }
}

function pass(reason, extra) {
  // A pass carrying skips is a qualified pass. Under --strict it is not a pass at all.
  if (skipped.length && STRICT) {
    return blockFail(
      `--strict: ${skipped.length} gate(s) did not run — ${skipped.map((s) => s.gate).join(', ')}`,
    );
  }
  writeMarker('pass', { reason, ...extra });
  console.log(`\n[local-ci-gate] PASS — ${reason}`);
  if (skipped.length) {
    console.warn(`[local-ci-gate] QUALIFIED: ${skipped.length} gate(s) did NOT run:`);
    for (const s of skipped) console.warn(`  · ${s.gate} — ${s.reason}`);
    console.warn('[local-ci-gate] The marker records these. Re-run with --strict to require a full gate.');
  }
  console.log('[local-ci-gate] Safe to push. CI minutes will be spent on a change that already works locally.');
  // A docs-only pass never touched Docker or ran any tests — nothing to reap, and
  // reaping here would undercut the "no build, no CI needed" fast path (see isDocsOnly).
  if (!extra?.docsOnly) reapTestHygiene();
  process.exit(0);
}

/**
 * Shared plumbing behind blockFail and blockError: stamp the marker, print the
 * two-line banner, and exit non-zero. What distinguishes them — the status
 * recorded, the banner label, and what the status means — is each caller's own
 * job; see blockError's comment for why that distinction is load-bearing and
 * must not collapse back into "block() called twice with the same status".
 */
function block(status, label, explanation, reason, extra) {
  writeMarker(status, { reason, ...extra });
  console.error(`\n[local-ci-gate] ${label} — ${reason}`);
  console.error(`[local-ci-gate] ${explanation}`);
  reapTestHygiene();
  process.exit(1);
}

function blockFail(reason) {
  return block(
    'fail',
    'FAIL',
    'Do NOT push. Fix locally first so we do not burn GitHub Actions on a known-red build.',
    reason,
  );
}

/**
 * The gate could not reach a verdict.
 *
 * A crashed runner, a missing tool or an unreadable config is not the same
 * outcome as a failing test: one says the code is wrong, the other says we do
 * not know. Recording both as `fail` loses the distinction that tells you which
 * one to go and fix, and it is the shape of every "plausible result where there
 * should have been an error" defect this gate has produced. Blocking either
 * way is correct; calling them the same thing is not.
 */
function blockError(reason, cause) {
  return block(
    'error',
    'ERROR',
    'The gate did not reach a verdict. This is not a test failure: nothing was proven either way.',
    reason,
    { cause: cause ? String(cause.message || cause) : undefined },
  );
}

// ── --verify mode: confirm a green marker exists for a given sha ──────────────
function verify(sha) {
  if (!fs.existsSync(MARKER)) blockFailVerify(`no local gate marker found (run: node scripts/local-ci-gate.cjs)`);
  let m;
  try { m = JSON.parse(fs.readFileSync(MARKER, 'utf8')); } catch { blockFailVerify('marker unreadable'); }
  if (m.status !== 'pass') blockFailVerify(`last local gate was ${m.status}`);
  if (m.sha !== sha) blockFailVerify(`marker is for ${String(m.sha).slice(0, 8)}, not ${String(sha).slice(0, 8)} — re-run the gate`);

  // The marker's own record of what did not run. A green marker with skips is a
  // qualified green, and saying so is the entire point of stamping them.
  const gaps = Array.isArray(m.skipped) ? m.skipped : [];
  if (gaps.length && STRICT) {
    blockFailVerify(`--strict: marker is green but ${gaps.length} gate(s) were skipped — ${gaps.map((g) => g.gate).join(', ')}`);
  }

  // Note the default: an older marker with no `reason` says exactly that, rather than
  // asserting "full suite" on its behalf.
  console.log(`[local-ci-gate] verified green for ${String(sha).slice(0, 8)} (${m.reason || 'reason not recorded'})`);
  if (gaps.length) {
    console.warn(`[local-ci-gate] QUALIFIED — this green did NOT include ${gaps.length} gate(s):`);
    for (const g of gaps) console.warn(`  · ${g.gate} — ${g.reason}`);
  }
  process.exit(0);
}
function blockFailVerify(reason) {
  console.error(`[local-ci-gate] VERIFY FAILED — ${reason}`);
  process.exit(1);
}

// ── docker / compose bring-up ────────────────────────────────────────────────
function dockerAvailable() {
  return sh('docker version --format "{{.Server.Version}}"').status === 0;
}

function composeFile() {
  for (const f of ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']) {
    if (exists(f)) return f;
  }
  return null;
}

function buildLocalStack() {
  if (hasFlag('--no-docker')) return noteSkip('docker-build', '--no-docker passed');
  if (!dockerAvailable()) {
    return noteSkip('docker-build', 'Docker not available — relying on Testcontainers/in-process suites only');
  }
  const cf = composeFile();
  if (cf) {
    console.log(`[local-ci-gate] building local stack via ${cf}`);
    if (sh(`docker compose -f ${cf} build`, { stdio: 'inherit' }).status !== 0) blockFail('docker compose build failed');
  } else if (exists('Dockerfile')) {
    console.log('[local-ci-gate] building local image from Dockerfile');
    if (sh('docker build -t local-ci-gate:latest .', { stdio: 'inherit' }).status !== 0) blockFail('docker build failed');
  } else {
    console.log('[local-ci-gate] no Dockerfile/compose found — Testcontainers will pull images at test time');
  }
}

async function main() {
  const verifySha = arg('--verify');
  if (verifySha) return verify(verifySha);

  const base = arg('--base') || defaultBase();

  // Checked BEFORE the lock, not inside it: a docs-only diff never touches Docker
  // or the test stack, so it must not wait on — or hold — the host lock behind
  // everything else below. That was the whole point of "passes instantly" (see
  // the header); nesting this inside withLock() would have queued it behind
  // whatever else on the host currently owns the lock, same as a real test run.
  if (isDocsOnly(base)) {
    pass('docs-only diff — no build or CI required', { docsOnly: true });
  }

  // Everything from here through the reaper touches Docker, so this whole block
  // is serialised.
  /*
 * Say the worst case out loud, before waiting.
 *
 * The host lock waits up to forty minutes for another repository to finish.
 * Operators wrap this gate in their own timeout - run-logged.sh --timeout 900,
 * a background wrapper capped at 25 minutes - and an outer bound shorter than
 * the inner wait can never let the inner logic finish: every legitimate queue
 * becomes a kill and a misleading exit 124, and the run is relaunched into the
 * same trap. On 27 August that produced three relaunches and a diagnosis of
 * cross-repo contention when the lock was in fact held by a dead process.
 *
 * An outer bound must exceed the sum of the inner waits it contains. This
 * cannot check the operator's wrapper, so it states the number the wrapper has
 * to beat.
 */
console.log(
  `[local-ci-gate] worst-case wait for the host lock is 40min before the suite even starts; any outer timeout must exceed that plus the suite's own runtime`,
);
await withLock(lockRepoId, async () => {
    buildLocalStack();

    // Infra/Terraform projects ship a conformance phase. Its own design doc specifies
    // "one wire: run node scripts/infra-conformance.cjs" from this gate — a wire that was
    // never made, leaving the whole phase orphaned while the gate reported the suite green.
    // Conditional on existence, so non-infra projects are unaffected.
    const conformance = path.join(ROOT, 'scripts', 'infra-conformance.cjs');
    if (fs.existsSync(conformance)) {
      const allowSkips = hasFlag('--allow-skips') && !STRICT;
      console.log('[local-ci-gate] running infra conformance (scripts/infra-conformance.cjs)…');
      const c = sh(`node "${conformance}"${allowSkips ? ' --allow-skips' : ''}`, { stdio: 'inherit' });
      if (c.status !== 0) blockFail('infra conformance is red — see the step named above');
      if (allowSkips) {
        noteSkip('infra-conformance', '--allow-skips forwarded; some conformance steps did not run');
      }
    }

    // Context budget. A committed file large enough to fill an agent's context
    // makes every session that reads it compact on that single read (DF-BUG-5: a
    // 937 KB status dashboard, a 250 KB lighthouse report). The verifier existed
    // and was in verify:all, but nothing on the MERGE path ran it - so a
    // quarter-million-token file could sit tracked indefinitely with no gate
    // objecting. It fails at 100 KB per readable file; warnings do not block.
    const budget = path.join(ROOT, 'scripts', 'verify-context-budget.cjs');
    if (fs.existsSync(budget)) {
      console.log('[local-ci-gate] checking context budget (scripts/verify-context-budget.cjs)');
      const b = sh(`node "${budget}"`, { stdio: 'inherit' });
      if (b.status !== 0) blockFail('a readable file is over the context budget - see the step above; split it, summarise it, or gitignore it if generated');
    }

    const runner = path.join(ROOT, 'scripts', 'run-all-tests.cjs');
    if (!fs.existsSync(runner)) blockFail('scripts/run-all-tests.cjs missing — complete foundation-cicd first');

    // Forward the scope rather than hardcoding a bare invocation.
    //
    // This used to run `node run-all-tests.cjs` with no arguments, which had two
    // consequences. The workflow ran the suite TWICE per story - once at the
    // story-regression step with `--scope story`, then again here - for no extra
    // signal, roughly doubling local CI time. And because no --scope or --story
    // reached the runner, the gate could not be asked for epic or release scope
    // at all, and before storyId inference was restored it silently ran
    // smoke-only while printing "running full local suite".
    //
    // The log line now states the scope actually requested. Absent --scope, the
    // runner applies its own default and escalation rules, which is the correct
    // fallback: this script should not second-guess the resolver.
    const scopeArgs = [];
    if (scopeArg) scopeArgs.push('--scope', scopeArg);
    if (storyArg) scopeArgs.push('--story', storyArg);
    if (hasFlag('--epic-close')) scopeArgs.push('--epic-close');
    const scopeSuffix = scopeArgs.length ? ` ${scopeArgs.join(' ')}` : '';

    console.log(
      `[local-ci-gate] running local suite (scripts/run-all-tests.cjs${scopeSuffix || ' — resolver default'})…`,
    );
    // Merge rather than overwrite: runnerEnv() supplies host-lock-aware pool/heap
    // sizing (e.g. NODE_OPTIONS), but process.env may already carry its own
    // NODE_OPTIONS (debugging flags, a CI-set heap cap, whatever the shell has).
    // A plain {...process.env, ...runnerEnv(...)} spread would silently drop
    // whichever one process.env held, rather than combining the two.
    const lockEnv = runnerEnv({ hostLocked: true });
    const mergedEnv = { ...process.env, ...lockEnv };
    if (lockEnv.NODE_OPTIONS && process.env.NODE_OPTIONS) {
      mergedEnv.NODE_OPTIONS = `${process.env.NODE_OPTIONS} ${lockEnv.NODE_OPTIONS}`;
    }
    const res = sh(`node "${runner}"${scopeSuffix}`, { stdio: 'inherit', env: mergedEnv });
    if (res.status !== 0) blockFail('local test suite is red');

    const verifyReports = path.join(ROOT, 'scripts', 'verify-test-reports.cjs');
    if (fs.existsSync(verifyReports)) {
      console.log('[local-ci-gate] verifying test reports…');
      const vr = sh(`node "${verifyReports}"`, { stdio: 'inherit' });
      if (vr.status !== 0) blockFail('test reports missing or empty — suite may have timed out without running tests');
    }

    runStoryArtefactGate();

    pass('full local suite green against local build', { suite: 'run-all-tests.cjs' });
  });
}

function currentBranch() {
  const r = sh('git rev-parse --abbrev-ref HEAD');
  return r.status === 0 ? r.stdout.trim() : '';
}

function runStoryArtefactGate() {
  const branch = currentBranch();
  // Not a story branch: the gate genuinely does not apply, so this is not a skip.
  if (!/^feature\/E\d+-S/i.test(branch)) return;

  const gate = path.join(ROOT, 'tools', 'check-story-artifacts.sh');
  if (!fs.existsSync(gate)) return noteSkip('story-artefact', 'tools/check-story-artifacts.sh not scaffolded yet');
  if (process.env.SKIP_STORY_ARTIFACT_GATE === '1') {
    return noteSkip('story-artefact', 'SKIP_STORY_ARTIFACT_GATE=1');
  }
  // While GitHub CI is deferred this is the ONLY place the artefact gate runs (see the
  // header). Waving it through because the machine lacks bash means a story branch can
  // be pushed with no story test report at all — so on a story branch this is fatal,
  // not a warning. SKIP_STORY_ARTIFACT_GATE=1 remains the deliberate way out.
  if (sh('bash --version').status !== 0) {
    return blockFail(
      'bash not available, so the story-artefact gate cannot run on this story branch. ' +
        'Install bash (Git for Windows ships it), or set SKIP_STORY_ARTIFACT_GATE=1 to accept the gap deliberately.',
    );
  }
  console.log('[local-ci-gate] running story-artefact gate (tools/check-story-artifacts.sh)…');
  const r = sh(`bash "${gate}"`, { stdio: 'inherit', env: { ...process.env, PYTHONHOME: undefined, BRANCH_NAME: branch } });
  if (r.status !== 0) blockFail('story-artefact gate failed — story test report missing/incomplete');
}

main().catch((err) => {
  // An unhandled throw means the gate itself broke, so it records `error`
  // rather than exiting silently with a stale or absent marker.
  try {
    blockError('the gate crashed before reaching a verdict', err);
  } catch {
    console.error(`[local-ci-gate] ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
});
