// The full-scope regression skip must filter the ENTRIES inside the targets file,
// not the file's own path. #394 matched the coverage glob against
// tests/regression/regression-targets.txt - a path that matches no file-shaped
// glob - so skippedRedundant was always 0 and the lane re-ran everything it had
// already run, ~35 minutes of duplication that blew the 30-minute timeout.
//
// This tests the entry-filter logic directly: given a targets file of `tier:path`
// entries and a set of coverage globs, the covered entries are dropped and the
// uncovered ones kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The matcher and filter, mirroring run-all-tests.cjs. If the runner's copy
// changes, this must too - it guards the exact semantics the skip depends on.
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
      else re += '[^/]*';
    } else if ('\\^$+?.()|{}[]'.includes(c)) { re += `\\${c}`; }
    else re += c;
  }
  return new RegExp(`^${re}$`);
}
function filterEntries(lines, globs) {
  const res = globs.map(globToRe);
  const covered = (p) => res.some((r) => r.test(p));
  let skipped = 0;
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) { kept.push(line); continue; }
    const colon = t.indexOf(':');
    const entryPath = colon === -1 ? t : t.slice(colon + 1);
    if (covered(entryPath)) { skipped += 1; continue; }
    kept.push(line);
  }
  return { skipped, kept: kept.filter((l) => l.trim() && !l.trim().startsWith('#')) };
}

const GLOBS = ['apps/*/tests/unit/**', 'apps/*/tests/integration/**', 'tests/e2e/**'];

test('covered entries are dropped, uncovered kept', () => {
  const lines = [
    'unit-py:apps/api/tests/unit/test_a.py',        // covered
    'integration-py:apps/api/tests/integration/x.py', // covered
    'e2e:tests/e2e/health.spec.ts',                 // covered
    'unit-py:ci/tests/test_images.py',              // ORPHAN - kept
    'script:tests/scripts/runbook.test.cjs',        // ORPHAN - kept
  ];
  const { skipped, kept } = filterEntries(lines, GLOBS);
  assert.equal(skipped, 3);
  assert.deepEqual(kept, ['unit-py:ci/tests/test_images.py', 'script:tests/scripts/runbook.test.cjs']);
});

test('the filter matches the ENTRY path, not the targets-file path', () => {
  // The #394 bug: matching tests/regression/regression-targets.txt against the
  // globs skips nothing. Prove the entry path is what is matched.
  const { skipped } = filterEntries(['unit-py:apps/api/tests/unit/x.py'], GLOBS);
  assert.equal(skipped, 1, 'the entry path must be matched, not the container file');
});

test('comments and blank lines are preserved, not counted as skipped', () => {
  const { skipped, kept } = filterEntries(
    ['# a comment', '', 'unit-py:apps/api/tests/unit/x.py', 'script:orphan.py'], GLOBS);
  assert.equal(skipped, 1);
  assert.deepEqual(kept, ['script:orphan.py']);
});

test('empty coverage globs keep everything (safe default)', () => {
  const { skipped } = filterEntries(['unit-py:apps/api/tests/unit/x.py'], []);
  assert.equal(skipped, 0);
});