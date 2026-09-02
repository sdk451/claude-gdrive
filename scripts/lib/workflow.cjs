'use strict';
/**
 * Workflow definitions as data (D-38).
 *
 * WHY THIS EXISTS
 *   The kit ships 21 workflows, all as markdown prose, and each agent file carries
 *   both the persona and the numbered step sequence. So varying a sequence means
 *   forking an agent, and adding a variant means editing 21 files. That is why no
 *   variant exists.
 *
 *   Role stays in agents/<name>.md. Sequence moves here. A variant overrides a step
 *   rather than forking a persona.
 *
 * OVERRIDES
 *   .swekit/workflows/<id>.override.yaml is merged over the baseline. A step
 *   may be replaced, disabled, or inserted; a phase may have its step list rewritten.
 *   Anything not mentioned is inherited, which is what keeps a customer on the
 *   baseline's improvements instead of stranding them on a fork (D-25).
 */
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_DIR = '.swekit/workflows';

/**
 * Minimal YAML reader for the shapes this file uses: nested maps, inline flow
 * sequences, and scalars. Deliberately not a general parser - a workflow that
 * cannot load because an optional dependency is missing would be worse than no
 * workflow, and the shape here is fixed by us rather than by a customer.
 */
function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of text.split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;

    const item = /^- (.*)$/.exec(line);
    if (item) {
      const arr = parent.__list || (parent.__list = []);
      const obj = {};
      arr.push(obj);
      assign(obj, item[1]);
      stack.push({ indent, node: obj });
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = scalar(rest);
    }
  }
  return normalise(root);
}

function assign(obj, rest) {
  const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(rest);
  if (kv) obj[kv[1]] = kv[2] === '' ? {} : scalar(kv[2]);
}

function scalar(v) {
  const s = v.trim().replace(/\s+#.*$/, '').trim();
  if (/^\[.*\]$/.test(s)) {
    return s.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s.replace(/^["']|["']$/g, '');
}

// Lists collected under __list become the value of their parent key.
function normalise(node) {
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') {
        if (v.__list) { node[k] = v.__list.map(normalise); continue; }
        normalise(v);
      }
    }
  }
  return node;
}

function load(id, root = process.cwd()) {
  const base = path.join(root, WORKFLOW_DIR, `${id}.yaml`);
  if (!fs.existsSync(base)) throw new Error(`no workflow definition: ${WORKFLOW_DIR}/${id}.yaml`);
  const wf = parseYaml(fs.readFileSync(base, 'utf8'));

  const ovPath = path.join(root, WORKFLOW_DIR, `${id}.override.yaml`);
  if (fs.existsSync(ovPath)) applyOverride(wf, parseYaml(fs.readFileSync(ovPath, 'utf8')));
  return wf;
}

/**
 * Merge an override. Steps merge field by field so a customer can change one
 * attribute - the strategy, say - without restating the step.
 */
function applyOverride(wf, ov) {
  if (ov.steps) {
    for (const [name, patch] of Object.entries(ov.steps)) {
      wf.steps[name] = Object.assign({}, wf.steps[name] || {}, patch);
    }
  }
  if (ov.phases) {
    for (const p of ov.phases) {
      const target = (wf.phases || []).find((x) => x.phase === p.phase);
      if (target) Object.assign(target, p);
      else (wf.phases = wf.phases || []).push(p);
    }
  }
  for (const k of ['title', 'orchestrator']) if (ov[k]) wf[k] = ov[k];
  return wf;
}

/**
 * The ordered step list an agent should follow, with disabled steps removed.
 * This is what replaces the numbered list in the agent's prose.
 */
function steps(wf, ctx = {}) {
  const out = [];
  for (const phase of wf.phases || []) {
    for (const name of phase.steps || []) {
      const def = (wf.steps || {})[name];
      if (!def) { out.push({ name, phase: phase.phase, missing: true }); continue; }
      if (def.enabled === false) continue;
      if (def.when && !evaluate(def.when, ctx)) continue;
      out.push({ name, phase: phase.phase, repeats: !!phase.repeats, ...def });
    }
  }
  return out;
}

/** Only `key == value` and `key != value`; anything richer belongs in a gate. */
function evaluate(expr, ctx) {
  const m = /^(\S+)\s*(==|!=)\s*(\S+)$/.exec(String(expr));
  if (!m) return true;
  const [, key, op, want] = m;
  const have = String(ctx[key] === undefined ? '' : ctx[key]);
  return op === '==' ? have === want : have !== want;
}

/**
 * Structural validation. A workflow that references a step it does not define, or
 * an intent that is not a verb, must fail loudly at load rather than halfway
 * through a story.
 */
function validate(wf, verbs = [], opts = {}) {
  const problems = [];
  const defined = new Set(Object.keys(wf.steps || {}));
  const used = new Set();
  for (const phase of wf.phases || []) {
    if (!phase.phase) problems.push('a phase has no name');
    for (const name of phase.steps || []) {
      used.add(name);
      if (!defined.has(name)) problems.push(`phase ${phase.phase} references undefined step: ${name}`);
    }
  }
  for (const name of defined) {
    // A defined-but-unused step is NOT an error. Once an override rewrites a
    // phase, the baseline steps it dropped are still defined and that is the
    // expected state - inheriting a definition you do not use is the whole point
    // of overriding rather than forking. Reported separately by unused().
    const def = wf.steps[name];
    if (def.intent && verbs.length && !verbs.includes(def.intent)) {
      problems.push(`step ${name} uses a verb that does not exist: ${def.intent}`);
    }
    if (!def.does) problems.push(`step ${name} has no 'does' description`);

    // A `run:` target that does not resolve is the same defect class as a step
    // referencing a phase that does not exist, and it was not being caught: the
    // webapp variant shipped pointing at scripts/render-capture.cjs, which did
    // not exist, and validated clean. A step that reports success while pointing
    // at nothing is precisely what the gate model exists to prevent, so it is
    // checked here rather than discovered halfway through a story.
    // A `guidance:` anchor must resolve to a real heading in a real agent file.
    // The workflow owns order and phase; the agent file owns how. That split is
    // legitimate only while the mapping holds - a renamed or deleted section
    // leaves the agent following a heading that no longer exists, and nothing
    // would have said so.
    if (def.guidance && opts.agentsDir) {
      const problem = checkGuidance(def.guidance, opts.agentsDir);
      if (problem) problems.push(`step ${name}: ${problem}`);
    }

    if (def.run && opts.root) {
      const target = runTarget(def.run);
      if (target && !fs.existsSync(path.join(opts.root, target))) {
        problems.push(`step ${name} runs a script that does not exist: ${target}`);
      }
    }
  }
  return problems;
}

/**
 * Where the shipped agent files live, given the workflow root (the kit
 * repo's project-template directory during development, or an installed
 * project's root in production - the same directory `WF.load` reads
 * .swekit/workflows from).
 *
 * .claude/agents is checked first because it is where production actually
 * runs: this used to be `root/../agents` unconditionally, correct only
 * inside a kit-repo checkout, and every installed project inherited 3+
 * guaranteed guidance-check failures because that path resolves to a
 * meaningless sibling of the project root out there. Falls back to
 * root/../agents for kit-repo development, where the installer's
 * .claude/agents does not exist yet to have installed anything into.
 *
 * Returns undefined - not a guessed path - when neither exists, so a caller
 * can tell "no agents dir" apart from "agents dir, but empty". validate()
 * already treats a falsy agentsDir as "skip guidance checks" rather than
 * crashing on a path that resolves to nothing.
 */
function resolveAgentsDir(root) {
  return [
    path.join(root, '.claude', 'agents'),
    path.join(root, '..', 'agents'),
  ].find((d) => fs.existsSync(d));
}

/**
 * Resolve a `guidance: <file>#<heading>` anchor. Returns a problem string, or
 * null when it resolves.
 */
function checkGuidance(ref, agentsDir) {
  const m = /^([^#]+)#(.+)$/.exec(String(ref).trim());
  if (!m) return `guidance must be '<agent-file>#<heading>', got '${ref}'`;
  const [, file, heading] = m;
  const p = path.join(agentsDir, file);
  if (!fs.existsSync(p)) return `guidance names a file that does not exist: ${file}`;
  const body = fs.readFileSync(p, 'utf8');
  // Match the heading prefix, so "Step 6" resolves against "### Step 6 — ...".
  const re = new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')}\\b`, 'm');
  if (!re.test(body)) return `guidance names a heading not found in ${file}: ${heading}`;
  return null;
}

/**
 * The script a `run:` command actually invokes.
 *
 * Returns null when the command is not a script invocation we can resolve - a
 * shell builtin, a bare binary on PATH, or an npm script. Guessing at those
 * would produce false failures, and a check that cries wolf gets disabled.
 */
function runTarget(cmd) {
  const m = /^(?:node|python3?|sh|bash)\s+(\S+)/.exec(String(cmd).trim());
  if (m) return m[1];
  const first = String(cmd).trim().split(/\s+/)[0];
  return /^(?:\.\/|scripts\/|kit\/)/.test(first) ? first : null;
}

/** Steps defined but not referenced by any phase. Informational, not a failure. */
function unused(wf) {
  const used = new Set();
  for (const phase of wf.phases || []) for (const n of phase.steps || []) used.add(n);
  return Object.keys(wf.steps || {}).filter((n) => !used.has(n));
}

module.exports = { WORKFLOW_DIR, load, steps, validate, unused, runTarget, checkGuidance, resolveAgentsDir, applyOverride, parseYaml };