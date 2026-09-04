// The MCP allow-list validator warns on likely typos (an entry that matches a
// connected server only after ignoring case/whitespace) and stays quiet
// otherwise. It runs at session start, only warns, and never blocks - exit is
// always 0. This is the advisory answer to DF-BUG-9's UX footgun: the MCP matcher
// is exact by design (loosening it would be a security regression), so a config
// typo silently prompts forever; this surfaces the typo without changing any
// permission decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(HERE, '..', 'validate-permission-config.cjs');

function repo(policy, settings) {
  const d = mkdtempSync(path.join(tmpdir(), 'cfg-val-'));
  mkdirSync(path.join(d, '.claude'), { recursive: true });
  writeFileSync(path.join(d, '.claude', 'permissions-policy.json'), JSON.stringify(policy));
  writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify(settings));
  return d;
}
function run(d) {
  const r = spawnSync('node', [VALIDATOR, d], { encoding: 'utf8' });
  return { code: r.status, err: r.stderr || '' };
}
const SETTINGS = { hooks: { PreToolUse: [{ matcher: 'mcp__github__.*', hooks: [] }] } };

test('warns on a case typo and names the fix', () => {
  const r = run(repo({ mcpServers: { allow: ['GitHub'] } }, SETTINGS));
  assert.equal(r.code, 0, 'must never block');
  assert.match(r.err, /Did you mean "github"/);
});

test('warns on a trailing-space typo', () => {
  const r = run(repo({ mcpServers: { allow: ['github '] } }, SETTINGS));
  assert.match(r.err, /Did you mean "github"/);
});

test('stays silent on a correct allow-list', () => {
  const r = run(repo({ mcpServers: { allow: ['github'] } }, SETTINGS));
  assert.equal(r.code, 0);
  assert.equal(r.err.trim(), '');
});

test('does not warn on an entry that matches nothing (not a typo, just unwired)', () => {
  const r = run(repo({ mcpServers: { allow: ['some-real-server'] } }, SETTINGS));
  assert.equal(r.err.trim(), '', 'must not be noisy about servers not referenced in hooks');
});

test('no mcpServers block does not crash', () => {
  const r = run(repo({ shell: {} }, SETTINGS));
  assert.equal(r.code, 0);
});

test('no settings hooks to cross-check: stays quiet rather than guessing', () => {
  const r = run(repo({ mcpServers: { allow: ['GitHub'] } }, {}));
  assert.equal(r.code, 0);
  assert.equal(r.err.trim(), '');
});