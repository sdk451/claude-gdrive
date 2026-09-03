// The context budget measures GIT-TRACKED readable files, not the whole
// filesystem, and it is ADVISORY - it never blocks the merge gate.
//
// Two defects fixed here (DF-BUG-8):
//  1. The gate ran the budget as blockFail, turning an input-optimisation health
//     signal into a merge acceptance criterion. A change is not incorrect because
//     some other, untouched file is large.
//  2. The checker walked the whole filesystem, flagging .venv/, gitignored
//     artefacts, other worktrees, and a deliberately-kept 72 MB graph.json - none
//     of which an agent reads from a clean checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(HERE, '..', 'verify-context-budget.cjs');

function repo(setup) {
  const d = mkdtempSync(path.join(tmpdir(), 'cb-scope-'));
  const run = (c) => execSync(c, { cwd: d, stdio: 'pipe' });
  run('git init -q'); run('git config user.email t@t'); run('git config user.name t');
  const W = (f, kb) => {
    const fp = path.join(d, f);
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, 'x'.repeat(kb * 1024));
  };
  setup({ d, run, W });
  return d;
}
function budget(d) {
  const r = spawnSync('node', [CHECKER], { cwd: d, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('a gitignored large file is not flagged', () => {
  const d = repo(({ run, W, d }) => {
    W('.venv/big.json', 200);
    writeFileSync(path.join(d, '.gitignore'), '.venv/\n');
    run('git add -A'); run('git commit -qm i');
  });
  assert.ok(!budget(d).out.includes('big.json'));
});

test('an untracked large file is not flagged', () => {
  const d = repo(({ run, W }) => {
    W('seed.md', 1); run('git add -A'); run('git commit -qm i');
    W('untracked-big.json', 200); // never added
  });
  assert.ok(!budget(d).out.includes('untracked-big'));
});

test('a tracked large file IS still flagged', () => {
  const d = repo(({ run, W }) => {
    W('docs/huge.md', 200); run('git add -A'); run('git commit -qm i');
  });
  const r = budget(d);
  assert.ok(r.out.includes('huge.md'));
  assert.equal(r.code, 1, 'the checker itself still exits non-zero - the GATE is what no longer blocks');
});

test('graphify machine artefacts are excluded (tracked but never read raw)', () => {
  // graph.json / manifest.json / GRAPH_REPORT / .graphify_* are generated and
  // tracked, but an agent reads GRAPH_REPORT.md's summary, not the raw AST. They
  // are the graphify equivalent of node_modules and must not drown the real signal.
  const d = repo(({ run, W }) => {
    W('graphify-out/graph.json', 200);
    W('graphify-out/manifest.json', 200);
    W('docs/real-context.md', 200);
    run('git add -A'); run('git commit -qm i');
  });
  const out = budget(d).out;
  assert.ok(!out.includes('graph.json'), 'graph.json must be excluded');
  assert.ok(!out.includes('manifest.json'), 'manifest.json must be excluded');
  assert.ok(out.includes('real-context.md'), 'genuine docs must still be flagged');
});
