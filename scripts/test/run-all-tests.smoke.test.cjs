'use strict';

// Smoke test for run-all-tests.cjs.
//
// WHY THIS EXISTS
//   A ReferenceError shipped to twelve repositories and crashed every regression
//   run. `node --check` passed, because it validates SYNTAX and says nothing about
//   undefined identifiers - a stale `inScope` reference survived a rename to
//   `baseScope`/`included.suites` and was only reachable at runtime.
//
//   The lesson is not "review harder". It is that a script nothing ever executes
//   in CI is a script whose runtime errors reach customers. This executes the real
//   entry point so the suite-selection loop is actually walked.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const RUNNER = path.join(__dirname, '..', 'run-all-tests.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-runner-'));
  // A minimal project: git repo, manifest with no test scripts configured, so
  // every suite records as skip and no child process is actually spawned.
  // Every suite must be CONFIGURED, or the loop hits `continue` on the
  // not-configured branch and never reaches the scope check - which is exactly
  // how the first version of this test passed with the bug still present.
  // The commands are no-ops so nothing is actually executed.
  const noop = `${JSON.stringify(process.execPath)} -e ""`;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fx',
    version: '1.0.0',
    scripts: {
      'test:unit': noop, 'test:integration': noop, 'test:component': noop,
      'test:e2e': noop, 'test:visual': noop, 'test:a11y': noop, test: noop,
    },
  }));
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
  for (const args of [['init', '-q'], ['config', 'user.email', 't@t'], ['config', 'user.name', 't']]) {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  }
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: dir, encoding: 'utf8', timeout: 60000,
  });
}

for (const scope of ['slice', 'story', 'epic', 'full']) {
  test(`runner executes without a runtime error at --scope ${scope}`, () => {
    const dir = fixture();
    const r = run(dir, ['--scope', scope]);
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    // Prove the scope check was actually reached: at any scope below full there
    // is at least one configured suite that must be reported out of scope.
    if (scope !== 'full') assert.match(out, /not in scope|skip/i, out.slice(0, 600));
    // The specific regression: any identifier that survived a rename.
    assert.doesNotMatch(out, /ReferenceError/,
      `runtime ReferenceError at --scope ${scope}:\n${out.slice(0, 800)}`);
    assert.doesNotMatch(out, /is not defined/, out.slice(0, 800));
    assert.doesNotMatch(out, /TypeError/, out.slice(0, 800));
  });
}

test('the resolved scope is reported, so a reader can see what ran', () => {
  const dir = fixture();
  const out = `${run(dir, ['--scope', 'story']).stdout || ''}`;
  assert.match(out, /\[regression\] scope=/);
});

test('an unknown --include is rejected rather than silently ignored', () => {
  const dir = fixture();
  const r = run(dir, ['--scope', 'story', '--include', 'test:nonsense']);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.doesNotMatch(out, /ReferenceError/, out.slice(0, 400));
  assert.match(out, /rejected/);
});

test('a valid --include is accepted and reaches the suite loop', () => {
  const dir = fixture();
  const r = run(dir, ['--scope', 'story', '--include', 'test:a11y']);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.doesNotMatch(out, /ReferenceError/, out.slice(0, 400));
  assert.doesNotMatch(out, /is not defined/, out.slice(0, 400));
});

// --------------------------------- requiring the module must not run the gate

test('requiring the runner does not execute it or exit the process', () => {
  // Regression: a kit sync replaced this file with a copy that had a bare
  // `main()` and no exports, silently removing a downstream guard. Requiring the
  // module then ran the whole gate and called process.exit(1) in the middle of
  // another suite - so an unrelated test file failed with no useful message.
  //
  // Exercised in a child process because a process.exit() in-process would take
  // this test runner down with it, which is precisely the failure being guarded.
  const r = spawnSync(process.execPath,
    ['-e', `const m = require(${JSON.stringify(RUNNER)}); process.stdout.write(Object.keys(m).sort().join(','));`],
    { encoding: 'utf8', timeout: 30000, cwd: fixture() });

  assert.equal(r.status, 0, `requiring the runner exited ${r.status}:\n${r.stderr}`);
  assert.doesNotMatch(r.stdout, /\[regression\]/, 'requiring the runner executed the gate');
  assert.equal(r.stdout.trim(), 'regressionTargetCommand,shellQuote,windowsBashPath');
});
