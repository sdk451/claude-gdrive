'use strict';
/**
 * Toolchain adapters — the eight-verb intent contract (D-41).
 *
 * WHY THIS EXISTS
 *   Integration lived in agent prose: implementer.md carries 22 `gh` invocations
 *   and 17 tracker references, and reviewer.md and runner.md carry more. Three
 *   problems follow from that, and all three are structural rather than stylistic.
 *
 *     1. The agent sits in the credential path. It composes a shell string and
 *        runs it, so the secret is reachable from the model's context.
 *     2. The action is unverifiable afterwards. The evidence record can only hold
 *        whatever string the agent happened to build, which is not the same thing
 *        as what the provider actually did.
 *     3. Every new provider means editing prose in a dozen agent files, so the
 *        adapter surface cannot grow.
 *
 *   The agent now emits an INTENT. The runner resolves the adapter, authenticates,
 *   calls it, and writes one evidence event carrying the intent and the result.
 *
 * THE EIGHT VERBS
 *   Deliberately small. Anything richer leaks one vendor's model into the
 *   methodology, and five deep integrations become five products to maintain.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Ten, not the eight the design first claimed. Migrating implementer.md showed
// the original set could not express two things the loop genuinely does:
//
//   checks.status  reading CI state. A read, no authority implication - the gap
//                  was simply an oversight in the first cut.
//   pr.merge       merging the PR. This one is NOT an oversight, see below.
//
// Adding verbs is the drift the small surface exists to prevent, so each of these
// is justified in place rather than quietly appended.
const VERBS = [
  'story.fetch', 'story.list', 'story.transition', 'story.comment',
  'branch.announce', 'pr.open', 'pr.merge', 'checks.report', 'checks.status', 'doc.publish',
];

// ON pr.merge AND MERGE AUTHORITY
//
// The corpus lists `merge` in earned autonomy's `never_promote`, and the kit's
// implementer runs `gh pr merge --squash` today. Those look contradictory and are
// not, but the distinction is worth stating because it will come up again:
//
//   `never_promote` governs the AUTONOMY ENGINE. It says the mechanism that
//   graduates an action class from prompt to auto-allow, on accumulated evidence,
//   may never graduate merge on its own.
//
//   A workflow that includes a merge step is different: a human chose that
//   workflow, and the choice is recorded. That is ratification up front rather
//   than ratification withheld.
//
// So pr.merge is a verb, and it stays out of `never_promote`'s reach. What it must
// never be is a step the autonomy engine adds by itself.

/** Verbs whose failure must never stop delivery. */
const NON_BLOCKING = new Set([
  'story.transition', 'story.comment', 'doc.publish', 'branch.announce', 'checks.report',
  'checks.status',   // a CI read that fails leaves the caller no worse off
]);

const CONFIG_REL = '.swekit/adapters.yaml';

/**
 * Adapter config. Kept deliberately parseable without a YAML dependency for the
 * common shape, because a missing optional parser must not stop a merge.
 */
function loadConfig(root) {
  const p = path.join(root, CONFIG_REL);
  if (!fs.existsSync(p)) return { adapters: {} };
  const raw = fs.readFileSync(p, 'utf8');
  const out = { adapters: {} };
  let current = null;
  for (const line of raw.split('\n')) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = /^ {2}([a-z][\w-]*):\s*$/.exec(line);
    if (top) { current = top[1]; out.adapters[current] = {}; continue; }
    const kv = /^ {4}([a-z_][\w-]*):\s*(.+?)\s*$/.exec(line);
    if (kv && current) {
      // Strip trailing comments. Without this, `provider: file  # file | github`
      // yields a provider literally named "file  # file | github", which then
      // matches nothing and every verb degrades to "does not implement" — the
      // config being self-documenting silently broke the config.
      const value = kv[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
      out.adapters[current][kv[1]] = value;
    }
  }
  return out;
}

/**
 * Resolve which adapter serves a verb. `pr.open` → forge, `story.*` → tracker.
 */
function adapterFor(verb, config) {
  const family = verb.split('.')[0];
  const map = { story: 'tracker', branch: 'forge', pr: 'forge', checks: 'forge', doc: 'docs' };
  // pr.merge and checks.status both belong to the forge, which the family map
  // already covers - no special case needed.
  const name = map[family];
  return { name, spec: (config.adapters || {})[name] || null };
}

/**
 * Perform an intent.
 *
 * Returns a verdict rather than throwing, because an adapter is not a gate: a
 * failed `story.transition` must warn and let the merge proceed. Today a `gh`
 * failure inside the implementer loop can stall a story that is already finished.
 */
function perform(intent, args, opts = {}) {
  const root = opts.root || process.cwd();
  if (!VERBS.includes(intent)) {
    return { intent, verdict: 'error', reason: `unknown verb: ${intent}`, blocking: true };
  }
  const config = opts.config || loadConfig(root);
  const { name, spec } = adapterFor(intent, config);

  if (!spec) {
    // An unconfigured adapter is a declared capability gap, not a failure. It
    // records as skipped so a reader can tell "not wired up" from "tried and
    // failed" — the same distinction the gate verdicts draw.
    return {
      intent, adapter: name, verdict: 'skipped',
      reason: `no ${name} adapter configured in ${CONFIG_REL}`,
      blocking: false,
    };
  }
  if (spec.provider === 'file') {
    // Wrap in a verdict like every other path. Returning the bare result here
    // meant the file adapter reported `undefined` where every caller expects a
    // verdict — the reference implementation being the one that broke the contract.
    try {
      return { intent, adapter: name, provider: 'file', verdict: 'pass',
               result: writeLocal(root, intent, args, spec) };
    } catch (err) {
      const blocking = !NON_BLOCKING.has(intent);
      return { intent, adapter: name, provider: 'file',
               verdict: blocking ? 'error' : 'warn',
               reason: String(err && err.message ? err.message : err).slice(0, 400), blocking };
    }
  }

  const runner = opts.exec || defaultExec;
  try {
    const out = runner(spec, intent, args, root);
    return { intent, adapter: name, provider: spec.provider, verdict: 'pass', result: out };
  } catch (err) {
    const blocking = !NON_BLOCKING.has(intent);
    return {
      intent, adapter: name, provider: spec.provider,
      verdict: blocking ? 'error' : 'warn',
      reason: (err && err.message ? err.message : String(err)).slice(0, 400),
      blocking,
    };
  }
}

/**
 * The reference adapter: append the intent to a local file. It is the test
 * double, and it is what a repo with no tracker gets — so the workflow runs
 * end to end with no external dependency at all.
 */
function writeLocal(root, intent, args, spec) {
  const target = path.join(root, spec.path || '.swekit/adapter-log.jsonl');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target,
    JSON.stringify({ ts: new Date().toISOString(), intent, args }) + '\n', 'utf8');
  return { written: path.relative(root, target) };
}

function defaultExec(spec, intent, args, root) {
  const argv = buildArgv(spec, intent, args);
  if (!argv) throw new Error(`${spec.provider} does not implement ${intent}`);
  return execFileSync(argv[0], argv.slice(1), { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

/**
 * Provider argv. The agent never composes this — that is the whole point.
 */
function buildArgv(spec, intent, a) {
  if (spec.provider === 'github') {
    switch (intent) {
      case 'pr.open':
        return ['gh', 'pr', 'create', '--title', a.title, '--body', a.body || '', '--base', a.base];
      case 'checks.report':
        return ['gh', 'pr', 'comment', String(a.pr), '--body', a.body];
      case 'checks.status':
        // One rollup read. The kit is explicit that `gh run watch` and
        // `--watch` are forbidden: polling burns API budget and wall-clock for
        // information a single call already carries.
        return ['gh', 'run', 'view', String(a.run), '--json', 'status,conclusion'];
      case 'pr.merge':
        return ['gh', 'pr', 'merge', String(a.pr), '--squash', '--delete-branch'];
      case 'branch.announce':
        return null;   // implicit in the push; recorded, not called
      default:
        return null;
    }
  }
  if (spec.provider === 'linear') {
    // Routed through the Linear MCP bridge rather than a REST call, so the
    // credential stays with the bridge process.
    switch (intent) {
      case 'story.transition':
        return ['node', 'scripts/run-linear-mcp.cjs', '--intent', intent, '--json', JSON.stringify(a)];
      case 'story.comment':
      case 'story.fetch':
      case 'story.list':
        return ['node', 'scripts/run-linear-mcp.cjs', '--intent', intent, '--json', JSON.stringify(a)];
      default:
        return null;
    }
  }
  return null;
}

module.exports = { VERBS, NON_BLOCKING, CONFIG_REL, loadConfig, adapterFor, perform, buildArgv };