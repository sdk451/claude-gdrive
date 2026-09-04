// Adversarial corpus for the two OTHER permission parsers - the write-path
// matcher (evaluateWrite) and the MCP server matcher (evaluateMcp) - built after
// the shell splitter's under-testing let four bugs reach production (DF-BUG-9).
//
// The splitter earned its corpus by failing. These two had NOT failed in
// production, which is not the same as being correct - so this corpus tries to
// break them the way real input would. The review finding: both are
// SECURITY-SOUND (nothing dangerous reaches allow), so this corpus locks that in
// against regression and documents the invariants.
//
// THE INVARIANT FOR BOTH: nothing outside the allowed set may reach `allow`.
//   write:  a path outside the project root, or matching a protected/self-mod
//           glob, must DENY - traversal, absolute paths, same-prefix siblings.
//   mcp:    a server not exactly on the allow-list must NOT allow - case,
//           whitespace, prefix and separator variants must fail closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const e = require(path.join(HERE, '..', '..', '.cursor', 'hooks', 'lib', 'policy-engine.cjs'));

const ROOT = process.platform === 'win32' ? 'C:\\repos\\demo' : '/repos/demo';
const WRITE_POLICY = {
  write: {
    containToProjectRoot: true,
    selfModificationGlobs: ['**/.claude/**', '**/.cursor/hooks/**'],
    protectedGlobs: ['**/.git/**'],
  },
};
const wv = (target) => e.evaluateWrite({ file_path: target }, WRITE_POLICY, ROOT).decision;

// ─────────────────────────────────────── write: escapes must all DENY ───────
const WRITE_ESCAPES = [
  ['parent traversal', `${ROOT}/../../etc/passwd`],
  ['deep traversal', `${ROOT}/src/../../../../etc/passwd`],
  ['trailing traversal', `${ROOT}/a/b/../../../../../tmp/x`],
  ['absolute posix', '/etc/passwd'],
  ['absolute windows', 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
  ['dotdot to root', `${ROOT}/..`],
  ['same-prefix sibling', `${ROOT}-evil/x`],
];
for (const [name, target] of WRITE_ESCAPES) {
  test(`write ESCAPE denies: ${name}`, () => {
    assert.equal(wv(target), 'deny', `escape must deny: ${target}`);
  });
}

// self-modification and protected paths must DENY even though inside the root
for (const [name, target] of [
  ['permission policy', `${ROOT}/.claude/permissions-policy.json`],
  ['hook script', `${ROOT}/.cursor/hooks/lib/policy-engine.cjs`],
  ['git internals', `${ROOT}/.git/config`],
]) {
  test(`write PROTECTED denies: ${name}`, () => {
    assert.equal(wv(target), 'deny');
  });
}

// legitimate in-root writes must ALLOW
for (const [name, target] of [
  ['source file', `${ROOT}/src/app.ts`],
  ['nested doc', `${ROOT}/docs/a/b/c.md`],
]) {
  test(`write LEGIT allows: ${name}`, () => {
    assert.equal(wv(target), 'allow');
  });
}

// ────────────────────────────────── mcp: unlisted must never ALLOW ──────────
const MCP_POLICY = { mcpServers: { allow: ['github', 'linear_app'] } };
const mv = (tool) => e.evaluateMcp(tool, MCP_POLICY).decision;

// allowed servers, including one with an underscore, must allow
for (const tool of [
  'mcp__github__create_issue',
  'mcp__github__',
  'mcp__linear_app__create',
  'mcp__github__get_pr__nested',
]) {
  test(`mcp ALLOWED allows: ${tool}`, () => assert.equal(mv(tool), 'allow'));
}

// anything not exactly an allowed server must NOT allow (fail closed)
for (const [name, tool] of [
  ['prefix sibling', 'mcp__github_evil__x'],
  ['suffix sibling', 'mcp__githubX__x'],
  ['uppercase', 'mcp__GitHub__x'],
  ['allcaps', 'mcp__GITHUB__x'],
  ['dotted', 'mcp__github.evil__x'],
  ['slashed', 'mcp__github/evil__x'],
  ['whitespace', 'mcp__github __x'],
  ['not mcp prefix', 'notmcp__github__x'],
  ['empty server', 'mcp____x'],
  ['unlisted', 'mcp__evil__x'],
]) {
  test(`mcp UNLISTED does not allow: ${name}`, () => {
    assert.notEqual(mv(tool), 'allow', `${tool} must fail closed, not allow`);
  });
}