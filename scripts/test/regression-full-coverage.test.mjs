// At full scope, a regression target already covered by a full suite is
// redundant and should be skipped; a target NOT covered must still run, or the
// skip becomes a silent coverage cut. This is opt-in per repo via
// gate.config.json's fullScopeCoverageGlobs; absent config skips nothing.
//
// This was caught in review before shipping: on the repo that prompted the fix,
// 646 of 648 targets were covered by the full suites but 2 (a ci/tests file and a
// tests/scripts runbook) were not - a blanket "skip regression at full" would have
// silently stopped running those two. The fix is per-target and glob-driven.
//
// The test exercises the coverage predicate directly - the same globToRe + glob
// match the runner uses - rather than spawning a full test run.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the runner's self-contained matcher (kept in sync deliberately;
// if the runner's matcher changes, this must too, and that is the point - the
// test guards the exact matching semantics the skip depends on).
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
      else re += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(c)) { re += '\\' + c; }
    else re += c;
  }
  return new RegExp(`^${re}$`);
}
const covered = (globs, rel) => globs.some((g) => globToRe(g).test(rel));

const GLOBS = [
  'apps/*/tests/unit/**',
  'apps/*/tests/integration/**',
  'apps/*/tests/e2e/**',
  'tests/e2e/**',
  'apps/partner-web/**',
];

test('a unit target inside a covered suite dir is covered (would skip at full)', () => {
  assert.ok(covered(GLOBS, 'apps/partner-api/tests/unit/test_health.py'));
});

test('an integration target inside a covered suite dir is covered', () => {
  assert.ok(covered(GLOBS, 'apps/partner-api/tests/integration/test_rls_tenant.py'));
});

test('a partner-web vitest target is covered by the broad glob', () => {
  assert.ok(covered(GLOBS, 'apps/partner-web/components/sites/sites-list.test.tsx'));
});

test('an e2e spec is covered', () => {
  assert.ok(covered(GLOBS, 'tests/e2e/health.spec.ts'));
});

test('a ci/tests target is NOT covered (must still run at full)', () => {
  // The real orphan from the repo that prompted this fix.
  assert.ok(!covered(GLOBS, 'ci/tests/test_images_matrix.py'));
});

test('a tests/scripts runbook target is NOT covered (must still run at full)', () => {
  assert.ok(!covered(GLOBS, 'tests/scripts/ses-production-cutover-runbook.test.cjs'));
});

test('empty coverage globs cover nothing (safe default skips nothing)', () => {
  assert.ok(!covered([], 'apps/partner-api/tests/unit/test_health.py'));
});

test('single-star does not cross directory separators', () => {
  // apps/*/tests must not match apps/a/b/tests
  assert.ok(!covered(['apps/*/tests/unit/**'], 'apps/a/b/tests/unit/x.py'));
});