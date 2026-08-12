'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveScope, readLedger, writeLedger, recordRun, targetFilesFor,
  markerExpression, epicAreas, NEVER_IN_GATES,
  DEFAULT_MAX_STORIES_BETWEEN_FULL,
} = require('../lib/regression-scope.cjs');

function tmpProject() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tmk-scope-'));
  fs.mkdirSync(path.join(d, 'tests', 'regression'), { recursive: true });
  fs.mkdirSync(path.join(d, 'docs', 'tests'), { recursive: true });
  return d;
}

test('a fresh project with no ledger runs FULL to establish a baseline', () => {
  // The dangerous default would be to assume no debt. A project that has never
  // recorded a full pass cannot prove one happened.
  const r = resolveScope({ requested: 'story', ledger: readLedger(tmpProject()) });
  assert.equal(r.scope, 'full');
  assert.equal(r.escalated, true);
  assert.match(r.reason, /baseline/);
});

test('story scope applies while debt is under an explicitly set ceiling', () => {
  const r = resolveScope({
    requested: 'story',
    maxStoriesBetweenFull: 5,
    ledger: { storiesSinceFull: 2 },
  });
  assert.equal(r.scope, 'story');
  assert.equal(r.escalated, false);
  assert.match(r.reason, /2\/5/);
});

test('BY DEFAULT there is no story-count ceiling: full is a promotion event', () => {
  // Full regression runs when a release is cut, not every N stories. A team that
  // wants a calendar safety net opts in by setting maxStoriesBetweenFull.
  const r = resolveScope({
    requested: 'story',
    ledger: { storiesSinceFull: 40, lastFullSha: 'abc' },
  });
  assert.equal(r.scope, 'story');
  assert.equal(r.escalated, false);
});

test('ESCALATION: an explicitly set ceiling still forces full without asking', () => {
  const r = resolveScope({
    requested: 'story',
    maxStoriesBetweenFull: 5,
    ledger: { storiesSinceFull: 5, lastFullSha: 'abc' },
  });
  assert.equal(r.scope, 'full');
  assert.equal(r.escalated, true);
  assert.match(r.reason, /stories merged since/);
});

test('epic close selects the epic subset, NOT a full pass', () => {
  // Epic close is a calendar event, not a risk event. Full is user-triggered
  // before a release or on completion of major work.
  const r = resolveScope({ requested: 'story', ledger: { storiesSinceFull: 0 }, isEpicClose: true });
  assert.equal(r.scope, 'epic');
  assert.match(r.reason, /risk-selected/);
});

test('debt still escalates to full even at epic close', () => {
  const r = resolveScope({
    requested: 'story',
    ledger: { storiesSinceFull: DEFAULT_MAX_STORIES_BETWEEN_FULL },
    isEpicClose: true,
  });
  assert.equal(r.scope, 'full', 'debt ceiling must outrank the epic subset');
});

test('explicit scopes map to themselves, not all to full', () => {
  const L = { storiesSinceFull: 0 };
  assert.equal(resolveScope({ requested: 'full', ledger: L }).scope, 'full');
  assert.equal(resolveScope({ requested: 'epic', ledger: L }).scope, 'epic');
  assert.equal(resolveScope({ requested: 'perf', ledger: L }).scope, 'perf');
});

test('an explicit perf or full request is never escalated', () => {
  // Neither is a narrowing, so debt is irrelevant to them.
  const debt = { storiesSinceFull: 999 };
  assert.equal(resolveScope({ requested: 'perf', ledger: debt }).escalated, false);
  assert.equal(resolveScope({ requested: 'full', ledger: debt }).escalated, false);
});

test('a dependency or build-config change escalates to full', () => {
  for (const f of ['package.json', 'pnpm-lock.yaml', 'Dockerfile', 'pyproject.toml',
                   'services/api/tsconfig.json', 'docker-compose.yml']) {
    const r = resolveScope({
      requested: 'story', ledger: { storiesSinceFull: 0 }, changedFiles: ['src/a.ts', f],
    });
    assert.equal(r.scope, 'full', `${f} should escalate`);
    assert.match(r.reason, /blast radius/);
  }
});

test('an ordinary source change does not escalate', () => {
  const r = resolveScope({
    requested: 'story', ledger: { storiesSinceFull: 1 },
    changedFiles: ['src/engine/router.py', 'docs/tests/E4-S1.md'],
  });
  assert.equal(r.scope, 'story');
});

test('a full pass clears the debt; narrow passes accrue it', () => {
  const p = tmpProject();
  writeLedger(p, { lastFullSha: 'aaa', lastFullAt: 'x', storiesSinceFull: 0, narrowedStories: [] });

  recordRun(p, { scope: 'story', storyId: 'E4-S1', sha: 'b1', passed: true });
  recordRun(p, { scope: 'story', storyId: 'E4-S2', sha: 'b2', passed: true });
  let l = readLedger(p);
  assert.equal(l.storiesSinceFull, 2);
  assert.deepEqual(l.narrowedStories, ['E4-S1', 'E4-S2']);

  recordRun(p, { scope: 'full', storyId: 'E4-S3', sha: 'b3', passed: true });
  l = readLedger(p);
  assert.equal(l.storiesSinceFull, 0);
  assert.equal(l.lastFullSha, 'b3');
  assert.deepEqual(l.narrowedStories, []);
});

test('a FAILED run never clears or accrues debt', () => {
  // Otherwise a red full run would reset the counter and buy 5 more narrow merges.
  const p = tmpProject();
  writeLedger(p, { lastFullSha: 'aaa', lastFullAt: 'x', storiesSinceFull: 3, narrowedStories: ['a'] });
  recordRun(p, { scope: 'full', storyId: 'E4-S9', sha: 'zzz', passed: false });
  const l = readLedger(p);
  assert.equal(l.storiesSinceFull, 3);
  assert.equal(l.lastFullSha, 'aaa');
});

test('full scope selects the accumulated list; story scope selects progression + smoke', () => {
  const p = tmpProject();
  fs.writeFileSync(path.join(p, 'tests', 'regression', 'regression-targets.txt'), 'a\n');
  fs.writeFileSync(path.join(p, 'tests', 'regression', 'smoke-targets.txt'), 'b\n');
  fs.writeFileSync(path.join(p, 'docs', 'tests', 'E4-S1-targets.txt'), 'c\n');

  const full = targetFilesFor(p, 'full', 'E4-S1');
  assert.equal(full.length, 1);
  assert.match(full[0], /regression-targets\.txt$/);

  const story = targetFilesFor(p, 'story', 'E4-S1');
  assert.equal(story.length, 2);
  assert.match(story[0], /E4-S1-targets\.txt$/);
  assert.match(story[1], /smoke-targets\.txt$/);
});

test('story scope with no progression file still runs smoke', () => {
  const p = tmpProject();
  fs.writeFileSync(path.join(p, 'tests', 'regression', 'smoke-targets.txt'), 'b\n');
  const story = targetFilesFor(p, 'story', 'E9-S9');
  assert.equal(story.length, 1);
  assert.match(story[0], /smoke-targets\.txt$/);
});


// ------------------------------------------------------------ marker queries --

test('PERF IS NEVER IN A GATE', () => {
  // Performance tests measure a machine, not a change. Gating on them teaches
  // everyone to re-run until green, which destroys the signal when it is real.
  for (const scope of ['story', 'epic', 'full']) {
    const e = markerExpression({ scope, areas: ['auth'] });
    assert.match(e, /not perf/, `${scope} must exclude perf`);
  }
  assert.equal(markerExpression({ scope: 'perf' }), 'perf', 'perf runs only in its own suite');
});

test('epic expression always includes smoke, unit and contract', () => {
  // Seams are where integration defects concentrate and they are cheap, so the
  // contract tier is unconditional rather than area-selected.
  const e = markerExpression({ scope: 'epic', areas: [] });
  for (const m of ['smoke', 'unit', 'contract']) assert.match(e, new RegExp(m));
});

test('epic expression folds in the epic areas and recently failed areas', () => {
  const e = markerExpression({
    scope: 'epic', areas: ['auth', 'routing'], recentlyFailedAreas: ['billing'],
  });
  assert.match(e, /area_auth/);
  assert.match(e, /area_routing/);
  assert.match(e, /area_billing/, 'a recent failure is the best cheap instability predictor');
});

test('epic expression excludes slow unless asked', () => {
  assert.match(markerExpression({ scope: 'epic', areas: ['auth'] }), /not slow/);
  assert.doesNotMatch(
    markerExpression({ scope: 'epic', areas: ['auth'], includeSlow: true }),
    /not slow/,
  );
});

test('area names are sanitised into marker-safe identifiers', () => {
  const e = markerExpression({ scope: 'epic', areas: ['Cost Router', 'a-b/c'] });
  assert.match(e, /area_cost_router/);
  assert.match(e, /area_a_b_c/);
  // Every emitted area token must be a legal identifier: spaces, slashes and
  // hyphens would break the marker expression at the framework level.
  for (const tok of e.match(/area_[^\s)]*/g) || []) {
    assert.match(tok, /^area_[a-z0-9_]+$/, `unsafe marker token: ${tok}`);
  }
});

test('duplicate areas across epic and recent failures collapse', () => {
  const e = markerExpression({ scope: 'epic', areas: ['auth'], recentlyFailedAreas: ['auth'] });
  assert.equal((e.match(/area_auth/g) || []).length, 1);
});

test('epicAreas returns [] rather than throwing when nothing is declared', () => {
  const p = tmpProject();
  assert.deepEqual(epicAreas(p, 'E4'), []);
  assert.deepEqual(epicAreas(p, null), []);
  fs.writeFileSync(path.join(p, 'docs', 'test-areas.json'), JSON.stringify({ E4: ['auth', 'routing'] }));
  assert.deepEqual(epicAreas(p, 'E4'), ['auth', 'routing']);
});

// --- story-focus opt-in ------------------------------------------------------

const {
  resolveIncludes: RI, SUITES_BY_SCOPE: SBS, INCLUDABLE_SUITES: INC,
} = require('../lib/regression-scope.cjs');

test('story scope does not run visual or a11y by default', () => {
  assert.ok(!SBS.story.includes('test:visual'));
  assert.ok(!SBS.story.includes('test:a11y'));
});

test('a UI story can opt into visual and a11y at story scope', () => {
  const r = RI({ requested: 'test:visual,test:a11y', baseSuites: SBS.story });
  assert.deepStrictEqual(r.includes, ['test:visual', 'test:a11y']);
  assert.deepStrictEqual(r.rejected, []);
  assert.ok(r.suites.includes('test:visual'));
  assert.ok(r.suites.includes('test:a11y'));
});

test('OPT-IN IS ADDITIVE ONLY: it never removes a suite the scope requires', () => {
  const r = RI({ requested: 'test:visual', baseSuites: SBS.story });
  for (const s of SBS.story) assert.ok(r.suites.includes(s), `${s} must survive`);
});

test('opt-in cannot reach the full pyramid from story scope', () => {
  const r = RI({ requested: INC.join(','), baseSuites: SBS.story });
  const missing = SBS.full.filter((s) => !r.suites.includes(s));
  assert.ok(missing.length > 0, 'story + every includable must still be short of full');
});

test('PERF IS NOT INCLUDABLE: it has its own scope', () => {
  assert.ok(!INC.includes('perf'));
  assert.ok(!INC.includes('test:perf'));
  const r = RI({ requested: 'perf', baseSuites: SBS.story });
  assert.deepStrictEqual(r.includes, []);
  assert.deepStrictEqual(r.rejected, ['perf']);
});

test('an unknown suite is rejected rather than silently ignored', () => {
  const r = RI({ requested: 'test:chaos', baseSuites: SBS.story });
  assert.deepStrictEqual(r.rejected, ['test:chaos']);
});

test('asking for something the scope already runs is a no-op, not a duplicate', () => {
  const r = RI({ requested: 'test:e2e', baseSuites: SBS.epic });
  assert.deepStrictEqual(r.includes, []);
  assert.strictEqual(r.suites.filter((s) => s === 'test:e2e').length, 1);
});

test('no --include leaves the scope exactly as resolved', () => {
  const r = RI({ requested: '', baseSuites: SBS.story });
  assert.deepStrictEqual(r.suites, SBS.story);
});


// ------------------------------------- the catch-all must never join a narrow tier

const { resolveSuites, CATCH_ALL_SUITE, SUITES_BY_SCOPE: BY_SCOPE } = require('../lib/regression-scope.cjs');

test('REGRESSION: story scope never includes the catch-all `test` script', () => {
  // graphene-consumer defines no test:unit, and its `test` is `turbo run test`,
  // which runs every package in the monorepo. With `test` in the story tier,
  // story close ran the entire estate while reporting a narrow scope - which is
  // the over-selection defect this tiering existed to remove.
  assert.ok(!BY_SCOPE.story.includes(CATCH_ALL_SUITE), 'story must not carry the catch-all');
  assert.ok(!BY_SCOPE.epic.includes(CATCH_ALL_SUITE), 'epic must not carry the catch-all');
  assert.ok(BY_SCOPE.full.includes(CATCH_ALL_SUITE), 'full is where the catch-all belongs');
});

test('a repo shaped like graphene-consumer runs only integration at story scope', () => {
  const defined = ['test:integration', 'test:e2e', 'test'];   // no test:unit
  const r = resolveSuites('story', defined);
  assert.deepEqual(r.suites, ['test:integration']);
  assert.equal(r.untiered, false);
  assert.ok(!r.suites.includes('test'), 'must not fall back to the monorepo-wide script');
});

test('a repo with NO tiered scripts falls back, and is told it is untiered', () => {
  const r = resolveSuites('story', ['test']);
  assert.deepEqual(r.suites, ['test']);
  assert.equal(r.untiered, true, 'the caller must be able to say so in the report');
});

test('full scope still runs the catch-all, and is not marked untiered', () => {
  const r = resolveSuites('full', ['test:unit', 'test']);
  assert.ok(r.suites.includes('test'));
  assert.equal(r.untiered, false);
});
