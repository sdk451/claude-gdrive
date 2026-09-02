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
const { execSync } = require('node:child_process');
const { readJsonState, writeJsonState } = require('./json-state.cjs');

const SCOPES = ['slice', 'story', 'epic', 'release', 'full', 'perf', 'docs'];

/** Scopes that deliberately run no gating suites. */
const NON_GATING_SCOPES = ['docs', 'perf'];

const LEDGER_REL = path.join('reports', 'regression-ledger.json');

/** Stories that may merge on the narrow scope before a full pass is forced. */
// Disabled by default. Full regression is a PROMOTION event, not a calendar one:
// it runs when a release is cut, not every N stories. A team that wants a
// story-count ceiling as a safety net sets maxStoriesBetweenFull explicitly.
/**
 * Stories that may merge on a narrowed scope before a full pass is forced.
 *
 * This was `null` (no ceiling), which trusts epic close and release triggers to
 * be the only things that ever run everything. That is the intended model, and
 * a ceiling is the backstop for when it does not hold -- a long-running epic, a
 * release that keeps slipping, a repo where nobody has run a release pass in
 * weeks. 10 is deliberately loose: it should almost never fire, and when it does
 * it means the normal triggers have not happened for long enough to be worth
 * noticing.
 *
 * Set to null to disable the ceiling entirely.
 */
const DEFAULT_MAX_STORIES_BETWEEN_FULL = 10;

/**
 * The checkout that owns the ledger.
 *
 * A git worktree is the same repository at a different commit, but it starts
 * with none of the repo's ignored files - and the ledger is ignored
 * (reports/*.json). So a worktree always looked like a project that had never
 * recorded a full pass, and resolveScope correctly escalated to full on every
 * story. The mechanism was working perfectly on false input: every
 * worktree-based story ran a full sweep, forever, because the evidence of past
 * full passes does not travel with the checkout.
 *
 * A full pass proven in the primary is proven for the worktree, so both read
 * and write go to the primary. `git rev-parse --git-common-dir` resolves to the
 * primary's .git even from inside a worktree; its parent is the primary root.
 *
 * Falls back to projectRoot when git is unavailable or this is not a worktree,
 * which is the ordinary case and costs nothing.
 */
// A single run-all-tests.cjs invocation resolves this five times over (once to
// read the ledger for scope resolution, once to read the baseline, twice more
// inside recordRun's own read-then-write, and once to write the baseline) - all
// for the same projectRoot and the same answer, since the checkout's relationship
// to its primary does not change mid-process. Each resolution is a `git
// rev-parse --git-common-dir` subprocess spawn, so caching per projectRoot turns
// that into one spawn per run instead of five. Keyed on the exact string passed
// in (callers are consistent within a process), not a normalised path.
const _ledgerRootCache = new Map();
function resolveLedgerRoot(projectRoot) {
  try {
    const common = execSync('git rev-parse --git-common-dir', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!common) return projectRoot;
    const abs = path.isAbsolute(common) ? common : path.join(projectRoot, common);
    const primary = path.dirname(abs);
    return fs.existsSync(primary) ? primary : projectRoot;
  } catch {
    return projectRoot;
  }
}

function ledgerRoot(projectRoot) {
  if (!_ledgerRootCache.has(projectRoot)) {
    _ledgerRootCache.set(projectRoot, resolveLedgerRoot(projectRoot));
  }
  return _ledgerRootCache.get(projectRoot);
}

/**
 * Distinct, attributable story ids.
 *
 * `unknown` is dropped rather than deduped. A run that cannot say which story it
 * belongs to is not evidence of a story having been narrowed - counting it
 * accrues debt attributable to nothing, and it cannot be cleared by identifying
 * the story later.
 */
function distinctStories(list) {
  return [...new Set((list || []).filter((s) => typeof s === 'string' && s && s !== 'unknown'))];
}

function readLedger(projectRoot) {
  const d = readJsonState(path.join(ledgerRoot(projectRoot), LEDGER_REL));
  if (d == null) {
    // No ledger is not "no debt": a project that has never recorded a full pass
    // cannot prove one happened. Treated as maximum debt, which forces full on
    // the first run and establishes the baseline.
    return { lastFullSha: null, lastFullAt: null, storiesSinceFull: Infinity, narrowedStories: [] };
  }
  const narrowedStories = Array.isArray(d.narrowedStories) ? d.narrowedStories : [];
  return {
    lastFullSha: typeof d.lastFullSha === 'string' ? d.lastFullSha : null,
    lastFullAt: typeof d.lastFullAt === 'string' ? d.lastFullAt : null,
    // DERIVED, never read from disk. The stored number counted RUNS: recordRun
    // appended on every passing narrow gate, so re-running one story's gate after
    // review feedback accrued a fresh "story" each time. graphene_supply's ledger
    // read 13 with four distinct stories in its own audit trail - E26-S1 counted
    // four times, E26-S2 four, E27-S1 three - so the ceiling of 10 fired after
    // roughly three real stories instead of ten, and full regression ran
    // perhaps three times more often than intended.
    //
    // The field was NAMED storiesSinceFull. The name asserted a guarantee the
    // arithmetic did not provide, and 13 is a plausible number, so nothing looked
    // wrong. Deriving it from the set removes the possibility: there is now one
    // source of truth and the count cannot disagree with the evidence for it.
    storiesSinceFull: distinctStories(narrowedStories).length,
    narrowedStories,
  };
}

function writeLedger(projectRoot, ledger) {
  // Written to the primary, matching readLedger - otherwise a worktree run
  // would clear debt into a file nothing reads afterwards.
  const out = { ...ledger };
  if (!Number.isFinite(out.storiesSinceFull)) out.storiesSinceFull = 0;
  return writeJsonState(path.join(ledgerRoot(projectRoot), LEDGER_REL), out);
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

  // DOCS-ONLY CHANGES DO NOT GATE.
  //
  // Checked BEFORE escalation deliberately: a docs commit cannot break a test,
  // so there is nothing for a full pass to protect against, and forcing one
  // because the ledger happens to be at its ceiling is pure cost. The check is
  // conservative -- it requires a non-empty changed-file list and EVERY entry to
  // be documentation. An empty list means "could not determine", which must not
  // read as "nothing to test".
  //
  // Code inside a docs directory is deliberately not exempt: a .cjs or .py under
  // docs/ is still executable and still gates.
  const changed = o.changedFiles || [];
  if (changed.length) {
    const isDocs = (f) =>
      /\.(md|mdx|markdown|txt|rst|adoc)$/i.test(f) ||
      /(^|[\\/])(docs|documentation)[\\/].*\.(md|mdx|markdown|txt|rst|adoc|png|jpg|jpeg|gif|svg|webp)$/i.test(f) ||
      /(^|[\\/])(LICENSE|CHANGELOG|CONTRIBUTING|CODEOWNERS)$/i.test(f);
    if (changed.every(isDocs)) {
      return {
        scope: 'docs',
        escalated: false,
        reason: `documentation only (${changed.length} file(s)) - no gate`,
      };
    }
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
  //
  // "Shared plumbing" means something that changes WHAT THE SUITE EXERCISES.
  // Tooling that only shapes the developer's editor or the CI runner does not,
  // and matching it escalates every story for no gain. `Dockerfile` was
  // unanchored, so it matched `.devcontainer/Dockerfile` - the editor container -
  // and graphene_supply ran a full sweep on every story for days because that
  // file sat in the branch diff from an earlier commit.
  //
  // The exclusion is applied FIRST so a path under it can never escalate,
  // whatever its basename.
  //
  // NOT at epic close. changedFiles there spans the whole epic, so any
  // package.json touched anywhere in it would force full - and an epic that
  // touched a dependency is exactly what the risk-selected subset is built to
  // cover. The LEDGER escalations below still apply at epic close, because those
  // are about missing evidence rather than blast radius, and epic close is the
  // moment to pay that debt down.
  const wide = (o.isEpicClose ? [] : o.changedFiles || [])
    .filter((f) => !/(^|[\\/])(\.devcontainer|\.github|\.vscode|\.idea|docs)[\\/]/i.test(f))
    .filter((f) =>
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
  // The list is the ledger. storiesSinceFull is derived on read, so it cannot
  // drift from the evidence - the old code maintained the integer separately and
  // capped only the list at 50, meaning past 50 narrow runs the auditable trail
  // silently understated the number that actually drove escalation.
  //
  // No cap is needed now: the list holds DISTINCT stories, and a project that
  // reaches the ceiling runs full and clears it. It cannot grow unbounded.
  const narrowedStories = distinctStories([...cur.narrowedStories, storyId || 'unknown']);
  return writeLedger(projectRoot, {
    ...cur,
    storiesSinceFull: narrowedStories.length,
    narrowedStories,
  });
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
  docs: [],
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
/**
 * Areas an epic declared in docs/test-areas.json, keyed by epic id.
 *
 * Written by the Test Architect at epic close - see the
 * epic-regression-risk-selection skill. `--scope epic` runs a fixed tier list,
 * which knows nothing about what the epic actually touched; the declared areas
 * are the judgement that closes that gap.
 *
 * Absent or unreadable returns [], which means the tier list alone applies.
 * That is a real gate, just an unselected one - so a missing file degrades to
 * "broad" rather than to "nothing".
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

function resolveSuites(scope, definedScripts) {
  // `docs` and `perf` legitimately define no gating suites, and an empty list is
  // the correct answer for them. Falling back to `story` on a falsy lookup would
  // turn "run nothing" into "run the story suite", which is precisely the bug the
  // docs bypass exists to avoid.
  const wanted = Array.isArray(SUITES_BY_SCOPE[scope]) ? SUITES_BY_SCOPE[scope] : SUITES_BY_SCOPE.story;
  const available = wanted.filter((s) => definedScripts.includes(s));
  if (available.length) return { suites: available, untiered: false };
  // The catch-all fallback exists so a project that defines only `test` still
  // gets a gate. It must NOT apply to scopes that deliberately run nothing:
  // `docs` and `perf` resolving to the catch-all would run the entire suite,
  // which is the exact opposite of what those scopes mean.
  if (scope !== 'full' && !NON_GATING_SCOPES.includes(scope) && definedScripts.includes(CATCH_ALL_SUITE)) {
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
 * absent for a different reason: it has its own scope, and no gating scope lists a
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
  epicAreas,
  SUITES_BY_SCOPE,
  INCLUDABLE_SUITES,
  resolveIncludes,
  LEDGER_REL,
  DEFAULT_MAX_STORIES_BETWEEN_FULL,
  ledgerRoot,
  readLedger,
  writeLedger,
  resolveScope,
  targetFilesFor,
  recordRun,
};
