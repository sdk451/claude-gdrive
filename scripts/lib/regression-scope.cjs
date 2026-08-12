'use strict';
/**
 * Regression scope: how much of the accumulated regression suite runs, and when.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * `tests/regression/regression-targets.txt` is append-only: every story adds its
 * targets and nothing is ever removed. The per-story merge gate then runs the
 * WHOLE accumulated file. So story N pays for stories 1..N, and cost grows
 * quadratically across an epic. Measured on a real project at 2026-08-02:
 *
 *     repo      stories   targets run per story merge
 *     engine       219      791
 *     supply        42       87
 *     infra         36       64
 *
 * Engine merges were ~9x the cost of supply merges for the same unit of work,
 * and the gap widens with every story. Nothing was misconfigured; this is what
 * append-only plus a full per-story run compounds to.
 *
 * THE FIX, AND ITS RISK
 * ---------------------
 * Per story, run the progression set Tess nominated plus a standing smoke list.
 * Run the full accumulated suite at epic close.
 *
 * The obvious failure mode is that "cheaper per story" quietly becomes "never
 * runs the full suite". Any scope narrowing that cannot prove the full suite ran
 * recently is just coverage loss with extra steps. So narrowing is DEBT, tracked
 * in a ledger, and the debt has a hard ceiling: once `maxStoriesBetweenFull`
 * stories have merged without a full pass, scope escalates to full automatically
 * and no longer asks. The ledger is the mechanism that makes this a scheduling
 * change rather than a coverage cut.
 */

const fs = require('node:fs');
const path = require('node:path');

const SCOPES = ['slice', 'story', 'epic', 'release', 'full', 'perf'];

/**
 * Tier markers. `perf` is deliberately absent from every gate: performance tests
 * measure a machine, not a change. On a contended workstation their variance
 * exceeds the regressions they exist to catch, so gating on them teaches
 * everyone to re-run until green and destroys the signal for the one time it
 * was real. They run on a schedule, on dedicated hardware.
 */
const TIERS = ['smoke', 'unit', 'contract', 'integration', 'e2e', 'perf'];
const NEVER_IN_GATES = ['perf'];
const LEDGER_REL = path.join('reports', 'regression-ledger.json');

/** Stories that may merge on the narrow scope before a full pass is forced. */
// Disabled by default. Full regression is a PROMOTION event, not a calendar one:
// it runs when a release is cut, not every N stories. A team that wants a
// story-count ceiling as a safety net sets maxStoriesBetweenFull explicitly.
const DEFAULT_MAX_STORIES_BETWEEN_FULL = null;

function readLedger(projectRoot) {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, LEDGER_REL), 'utf8');
    const d = JSON.parse(raw);
    return {
      lastFullSha: typeof d.lastFullSha === 'string' ? d.lastFullSha : null,
      lastFullAt: typeof d.lastFullAt === 'string' ? d.lastFullAt : null,
      storiesSinceFull: Number.isInteger(d.storiesSinceFull) ? d.storiesSinceFull : 0,
      narrowedStories: Array.isArray(d.narrowedStories) ? d.narrowedStories : [],
    };
  } catch {
    // No ledger is not "no debt": a project that has never recorded a full pass
    // cannot prove one happened. Treated as maximum debt, which forces full on
    // the first run and establishes the baseline.
    return { lastFullSha: null, lastFullAt: null, storiesSinceFull: Infinity, narrowedStories: [] };
  }
}

function writeLedger(projectRoot, ledger) {
  const p = path.join(projectRoot, LEDGER_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const out = { ...ledger };
  if (!Number.isFinite(out.storiesSinceFull)) out.storiesSinceFull = 0;
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

/**
 * Resolve the effective scope.
 *
 * @param {{requested?:string, ledger?:object, maxStoriesBetweenFull?:number,
 *          isEpicClose?:boolean, changedFiles?:string[]}} o
 * @returns {{scope:'story'|'full', escalated:boolean, reason:string}}
 */
function resolveScope(o = {}) {
  const requested = SCOPES.includes(o.requested) ? o.requested : 'story';
  const max = Number.isInteger(o.maxStoriesBetweenFull)
    ? o.maxStoriesBetweenFull
    : DEFAULT_MAX_STORIES_BETWEEN_FULL;   // null = no story-count ceiling
  const ledger = o.ledger || { storiesSinceFull: Infinity };
  const since = Number.isFinite(ledger.storiesSinceFull) ? ledger.storiesSinceFull : Infinity;

  // An explicit request for the two non-gating scopes is honoured as-is. `full`
  // is the user-triggered release pass; `perf` is the scheduled suite. Neither
  // is subject to escalation, because neither is a narrowing.
  if (requested === 'full' || requested === 'release') {
    return { scope: 'full', escalated: false, reason: 'full regression - release promotion' };
  }
  if (requested === 'perf') {
    return { scope: 'perf', escalated: false, reason: 'perf suite requested' };
  }

  // ESCALATION IS CHECKED BEFORE ANY NARROWING.
  // Order matters and is load-bearing: an earlier revision returned the epic
  // subset before reaching these checks, so a repo at its debt ceiling would
  // have silently taken the narrow path at epic close -- exactly the moment the
  // ceiling exists to catch. Every escalation must outrank every narrowing.
  if (!Number.isFinite(since)) {
    return {
      scope: 'full',
      escalated: true,
      reason: 'no recorded full regression pass - running full to establish the baseline',
    };
  }
  if (Number.isInteger(max) && since >= max) {
    return {
      scope: 'full',
      escalated: true,
      reason: `${since} stories merged since the last full pass (limit ${max})`,
    };
  }

  // A change to shared plumbing invalidates the assumption that the blast radius
  // is confined to the story's or epic's own areas.
  const wide = (o.changedFiles || []).filter((f) =>
    /(^|[\\/])(package\.json|pnpm-lock\.yaml|package-lock\.json|requirements[^\\/]*\.txt|pyproject\.toml|Dockerfile|docker-compose[^\\/]*\.ya?ml|tsconfig[^\\/]*\.json)$/i.test(f),
  );
  if (wide.length) {
    return {
      scope: 'full',
      escalated: true,
      reason: `dependency or build config changed (${wide[0]}) - blast radius is not story-local`,
    };
  }

  // Narrowings, in decreasing breadth.
  if (requested === 'epic' || o.isEpicClose) {
    // Epic close is a calendar event, not a risk event. It runs the
    // risk-selected epic subset; `full` is triggered by a person before a
    // release or on completion of major work. See docs/test-architecture.md.
    return { scope: 'epic', escalated: false, reason: 'epic scope - risk-selected subset' };
  }

  return {
    scope: 'story',
    escalated: false,
    reason: `story scope (${since}/${max} stories since last full pass)`,
  };
}

/**
 * Target files to feed run-targeted-tests.sh for the resolved scope.
 * Story scope is progression + smoke; smoke is optional but recommended.
 */
function targetFilesFor(projectRoot, scope, storyId) {
  const full = path.join(projectRoot, 'tests', 'regression', 'regression-targets.txt');
  if (scope === 'full') return [full].filter((p) => fs.existsSync(p));

  const out = [];
  if (storyId) {
    const prog = path.join(projectRoot, 'docs', 'tests', `${storyId}-targets.txt`);
    if (fs.existsSync(prog)) out.push(prog);
  }
  const smoke = path.join(projectRoot, 'tests', 'regression', 'smoke-targets.txt');
  if (fs.existsSync(smoke)) out.push(smoke);
  return out;
}

/** Record the outcome. A full pass clears the debt; a narrow one accrues it. */
function recordRun(projectRoot, { scope, storyId, sha, passed }) {
  if (!passed) return readLedger(projectRoot);
  const cur = readLedger(projectRoot);
  if (scope === 'full') {
    return writeLedger(projectRoot, {
      lastFullSha: sha || null,
      lastFullAt: new Date().toISOString(),
      storiesSinceFull: 0,
      narrowedStories: [],
    });
  }
  const since = Number.isFinite(cur.storiesSinceFull) ? cur.storiesSinceFull : 0;
  return writeLedger(projectRoot, {
    ...cur,
    storiesSinceFull: since + 1,
    narrowedStories: [...cur.narrowedStories, storyId || 'unknown'].slice(-50),
  });
}

/**
 * Build a marker expression for a scope.
 *
 * Selection is a QUERY, not a list. Enumerating node IDs makes the file grow
 * forever, drift from the code, and accumulate the same target in several
 * notations, which defeats deduplication and silently inflates every run.
 *
 * @param {{scope:string, areas?:string[], includeSlow?:boolean,
 *          recentlyFailedAreas?:string[]}} o
 * @returns {string|null} expression, or null when the scope is list-driven
 */
function markerExpression(o = {}) {
  const scope = o.scope;
  const areas = [...new Set([...(o.areas || []), ...(o.recentlyFailedAreas || [])])]
    .filter(Boolean)
    .map((a) => `area_${String(a).replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`);

  if (scope === 'perf') return 'perf';

  if (scope === 'slice') {
    // During the red-green loop only the story's own new tests run. They are
    // enumerated as progression targets, so there is no marker expression and
    // nothing else is pulled in. Speed here is what keeps the loop tight.
    return null;
  }

  if (scope === 'full') {
    // Everything the gates cover: all tiers except the excluded ones.
    return NEVER_IN_GATES.map((t) => `not ${t}`).join(' and ');
  }

  if (scope === 'epic') {
    // Contract and smoke unconditionally -- seams are where integration defects
    // concentrate and they are cheap. Plus every area the epic touched, plus
    // areas with a recent failure, which is the best cheap instability predictor.
    const base = ['smoke', 'unit', 'contract'];
    const areaClause = areas.length ? ` or (${areas.join(' or ')})` : '';
    let expr = `(${base.join(' or ')}${areaClause})`;
    for (const t of NEVER_IN_GATES) expr += ` and not ${t}`;
    if (!o.includeSlow) expr += ' and not slow';
    return expr;
  }

  if (scope === 'story') {
    // Story close is a TAILORED regression: this story's own tests (enumerated as
    // progression targets, so they need no marker) plus smoke plus the areas the
    // epic touches and any area with a recent failure. That is a small set,
    // re-runnable after every story.
    //
    // This previously returned `not perf`, which matches every tier and every
    // area - so story close ran the entire suite while claiming to be scoped.
    // Story, epic and full were all the same run. The regression ledger recorded
    // narrowing that never happened.
    const base = ['smoke'];
    const areaClause = areas.length ? ` or (${areas.join(' or ')})` : '';
    let expr = `(${base.join(' or ')}${areaClause})`;
    for (const t of NEVER_IN_GATES) expr += ` and not ${t}`;
    if (!o.includeSlow) expr += ' and not slow';
    return expr;
  }

  return null;
}

/**
 * Areas a project declares for an epic, read from docs/epics/<epic-id>.md
 * front matter or docs/test-areas.json. Absent areas are not an error: the epic
 * subset then falls back to smoke + unit + contract, which is still a real gate.
 */
function epicAreas(projectRoot, epicId) {
  if (!epicId) return [];
  try {
    const p = path.join(projectRoot, 'docs', 'test-areas.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const v = d[epicId] || d[String(epicId).toUpperCase()];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}


/**
 * Which suites a scope runs. Lives here rather than in the runner so the tiers
 * and the opt-in that widens them are testable in one place.
 */
// `test` is the CATCH-ALL, and it belongs to `full` alone.
//
// It was in `story` and `epic` as a fallback for repos with no tiered scripts.
// That is exactly backwards in a monorepo: `test` there is `turbo run test`, which
// runs every package's suite - so story close ran the entire estate while the
// report claimed a narrow scope. graphene-consumer has no `test:unit` at all, so
// its story tier resolved to integration plus the whole monorepo.
//
// A catch-all cannot be a member of a narrow tier. It is used only when a repo
// defines nothing else (see resolveSuites below), and then it is honestly
// reported as an untiered run rather than silently pretending to be scoped.
const SUITES_BY_SCOPE = {
  slice: ['test:unit'],
  story: ['test:unit', 'test:integration'],
  epic: ['test:unit', 'test:integration', 'test:component', 'test:e2e'],
  full: ['test:unit', 'test:integration', 'test:component', 'test:e2e', 'test:visual', 'test:a11y', 'test'],
  perf: [],
};

const CATCH_ALL_SUITE = 'test';

/**
 * Which suites to run, given the scope and what the repo actually defines.
 *
 * If a repo defines none of the tiered scripts, falling back to the catch-all is
 * better than running nothing - but the caller must be told, because "ran the
 * whole suite" and "ran the story tier" are different facts and a report that
 * conflates them is how the over-selection defect hid for weeks.
 */
function resolveSuites(scope, definedScripts) {
  const wanted = SUITES_BY_SCOPE[scope] || SUITES_BY_SCOPE.story;
  const available = wanted.filter((s) => definedScripts.includes(s));
  if (available.length) return { suites: available, untiered: false };
  if (scope !== 'full' && definedScripts.includes(CATCH_ALL_SUITE)) {
    return { suites: [CATCH_ALL_SUITE], untiered: true };
  }
  return { suites: [], untiered: false };
}

/**
 * Suites a story may opt into when they ARE its acceptance criteria.
 *
 * Deliberately just visual and a11y. Component and e2e are the expensive tiers
 * and belong to Tess's risk-selected epic close; allowing them here would let
 * story scope reach the full pyramid, which a test now forbids. `perf` is
 * absent for a different reason: it has its own scope and NEVER_IN_GATES holds.
 */
const INCLUDABLE_SUITES = ['test:visual', 'test:a11y'];

/**
 * Resolve a --include request against a base scope.
 *
 * Additive only: anything the scope already runs is dropped from the result
 * rather than duplicated, and nothing here can ever remove a suite.
 *
 * @param {{requested?:string, baseSuites:string[]}} o
 * @returns {{includes:string[], rejected:string[], suites:string[]}}
 */
function resolveIncludes(o) {
  const base = Array.isArray(o.baseSuites) ? o.baseSuites : [];
  const asked = String(o.requested || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rejected = asked.filter((s) => !INCLUDABLE_SUITES.includes(s));
  const includes = asked.filter((s) => INCLUDABLE_SUITES.includes(s) && !base.includes(s));

  return { includes, rejected, suites: base.concat(includes) };
}

module.exports = {
  SCOPES,
  CATCH_ALL_SUITE,
  resolveSuites,
  TIERS,
  NEVER_IN_GATES,
  SUITES_BY_SCOPE,
  INCLUDABLE_SUITES,
  resolveIncludes,
  markerExpression,
  epicAreas,
  LEDGER_REL,
  DEFAULT_MAX_STORIES_BETWEEN_FULL,
  readLedger,
  writeLedger,
  resolveScope,
  targetFilesFor,
  recordRun,
};
