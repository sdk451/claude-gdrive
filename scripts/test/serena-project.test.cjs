'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ensureLanguages, detectLanguages } = require('../serena/serena-project.cjs');
const { shouldPatch } = require('../serena/patch-terraform-arm64.cjs');
const { isTracked, register } = require('../serena/serena-project.cjs');
const { execFileSync } = require('node:child_process');

function tmpProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serena-test-'));
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  return dir;
}

test('detects languages from source extensions', () => {
  const dir = tmpProject({ 'src/a.ts': '', 'api/b.py': '', 'infra/c.tf': '' });
  const langs = detectLanguages(dir).sort();
  assert.deepEqual(langs, ['python', 'terraform', 'typescript']);
});

test('ignores vendor and build directories', () => {
  const dir = tmpProject({ 'node_modules/pkg/x.py': '', 'dist/y.py': '', 'src/a.ts': '' });
  assert.deepEqual(detectLanguages(dir), ['typescript']);
});

test('repairs a project.yml written before the languages schema', () => {
  const dir = tmpProject({ 'src/a.ts': '', '.serena/project.yml': 'project_name: "demo"\nencoding: "utf-8"\n' });
  const yml = path.join(dir, '.serena', 'project.yml');
  const r = ensureLanguages(yml, dir);
  assert.equal(r.changed, true);
  const text = fs.readFileSync(yml, 'utf8');
  assert.match(text, /^languages:/m);
  assert.match(text, /- typescript/);
  // project_name must survive, since it is what keeps a worktree distinct from
  // the canonical checkout.
  assert.match(text, /project_name: "demo"/);
});

test('is a no-op when languages already present', () => {
  const dir = tmpProject({ 'src/a.ts': '', '.serena/project.yml': 'project_name: "demo"\nlanguages:\n- typescript\n' });
  const r = ensureLanguages(path.join(dir, '.serena', 'project.yml'), dir);
  assert.equal(r.changed, false);
});

test('reports rather than guessing when no source is recognised', () => {
  const dir = tmpProject({ 'README.md': '', '.serena/project.yml': 'project_name: "demo"\n' });
  const r = ensureLanguages(path.join(dir, '.serena', 'project.yml'), dir);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no recognised source files/);
});

test('terraform patch applicability is platform-gated, not arch-gated', () => {
  // Node on a Windows ARM host is often an x64 build under emulation and cannot
  // see the host arch, so the patcher must not depend on process.arch.
  assert.equal(shouldPatch(), process.platform === 'win32');
});

// --------------------------------------------- never rewrite a tracked project.yml

function gitRepo(files) {
  const dir = tmpProject(files);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return dir;
}

test('isTracked distinguishes committed files from untracked ones', () => {
  const dir = gitRepo({ 'a.ts': '', '.serena/project.yml': 'project_name: "orig"\n' });
  assert.equal(isTracked(dir, '.serena/project.yml'), false);
  execFileSync('git', ['add', '.serena/project.yml'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'x'], { cwd: dir });
  assert.equal(isTracked(dir, '.serena/project.yml'), true);
});

test('a TRACKED project.yml keeps its name, so the rename cannot be committed', () => {
  // Regression: the canonical autonomous-swe-kit repo shipped project_name
  // "autonomous-swe-kit__execution-substrate" to master because a worktree
  // registration rewrote the tracked file and the change was committed.
  const dir = gitRepo({ 'a.ts': '', '.serena/project.yml': 'project_name: "orig"\nlanguages:\n- typescript\n' });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'x'], { cwd: dir });
  const before = fs.readFileSync(path.join(dir, '.serena', 'project.yml'), 'utf8');
  register(dir);
  const after = fs.readFileSync(path.join(dir, '.serena', 'project.yml'), 'utf8');
  assert.match(after, /project_name: "orig"/);
  assert.equal(before, after);
});
