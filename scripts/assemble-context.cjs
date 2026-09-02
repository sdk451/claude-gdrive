#!/usr/bin/env node
'use strict';

/**
 * Assemble the coding agent's brief, mechanically, before it starts.
 *
 * The agent used to retrieve its own context: read the epic index, read the
 * design doc, read the target list. Every one of those reads was whole-file and
 * unbounded, none was deduplicated, and a measured session spent 5.6 MB on 139
 * oversized tool results - including three files read twice, because compaction
 * discards the tool result while the plan still needs the content.
 *
 * This inverts it. The assembler does the reads **outside the model's window**,
 * where a 158 KB file costs zero tokens, extracts only the sections the step
 * declared, deduplicates by digest, enforces a byte budget before the agent sees
 * anything, and writes one bounded bundle. The agent reads that.
 *
 * Four properties follow, and the third is the one that breaks the loop:
 *
 *   bounded        the bundle has a cap enforced at assembly, not discovered at
 *                  compaction
 *   deduplicated   a section already in this session's ledger is referenced, not
 *                  repeated
 *   recoverable    if compaction happens anyway, recovery is ONE read of a
 *                  bounded file rather than N reads of large ones
 *   inspectable    the bundle and its manifest are artefacts: diffable,
 *                  attachable to evidence, and reviewable when a step goes wrong
 *
 * It does not stop an agent reading a file directly. It removes the reason to.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.env.ASSEMBLE_ROOT || process.cwd();
const OUT_DIR = path.join(ROOT, 'reports', 'context');
const LEDGER = path.join(OUT_DIR, 'ledger.json');

/** Four characters to a token. An estimate, and named as one. */
const tokens = (s) => Math.ceil(s.length / 4);
const digestOf = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Default budget: a quarter of a 200k window, so the brief cannot crowd out the work. */
const BUDGET_TOKENS = Number(process.env.CONTEXT_BUDGET_TOKENS || 50000);

/**
 * Pull one section out of a markdown document.
 *
 * The epic index is 116 KB and the step needs one epic. Extracting the heading
 * block whose title contains the id turns a 30k-token read into a 400-token one,
 * and it is the difference between splitting the file later and not needing to.
 */
function extractSection(text, id) {
  const lines = text.split(/\r?\n/);
  // A word-bounded match, not a substring one: `l.includes(id)` matched 'E1'
  // against a heading titled '## E10' or '## E11' - there was no '## E1' in
  // the document at all, and the wrong epic's content came back with
  // status: 'ok', silently. `\b` treats '0'/'1' as the same character class as
  // 'E1's own trailing digit, so it does not fire mid-number the way a plain
  // substring check does.
  const idPattern = new RegExp(`\\b${escapeRegExp(id)}\\b`);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && idPattern.test(l));
  if (start < 0) return null;
  const level = (/^(#{1,6})\s/.exec(lines[start]) || [, '#'])[1].length;
  let end = start + 1;
  while (end < lines.length) {
    const m = /^(#{1,6})\s/.exec(lines[end]);
    if (m && m[1].length <= level) break;
    end += 1;
  }
  return lines.slice(start, end).join('\n').trim();
}

function readIfPresent(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {
    return { session: null, seen: {} };
  }
}

function saveLedger(l) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
}

/**
 * One declared input.
 *
 * `section` extracts; its absence means the whole file, which is only ever
 * declared for things that are small by construction - a story, an acceptance
 * criteria file, a failing test.
 */
function resolveItem(item) {
  const text = readIfPresent(item.path);
  if (text === null) {
    return { ...item, status: 'absent', body: '', tokens: 0, digest: null };
  }
  if (item.section) {
    const body = extractSection(text, item.section);
    if (body === null) {
      // A declared section that does not exist is an error rather than an empty
      // include: the step asked for something specific and did not get it.
      return { ...item, status: 'section-missing', body: '', tokens: 0, digest: null };
    }
    return { ...item, status: 'ok', body, tokens: tokens(body), digest: digestOf(body) };
  }
  return { ...item, status: 'ok', body: text, tokens: tokens(text), digest: digestOf(text) };
}

/**
 * Assemble.
 *
 * Order is the policy: decisive inputs first, so that if the budget bites it
 * takes supporting material and never the brief. That is the position rule -
 * what a step must read is placed where it will be read.
 */
function assemble(spec, opts = {}) {
  const sessionId = spec.sessionId || 'default';
  const ledger = opts.ledger || loadLedger();
  if (ledger.session !== sessionId) {
    // A new session starts with an empty ledger: nothing is in a window that
    // does not exist yet.
    ledger.session = sessionId;
    ledger.seen = {};
  }

  const resolved = spec.inputs.map(resolveItem);
  const included = [];
  const referenced = [];
  const dropped = [];
  const missing = resolved.filter((r) => r.status !== 'ok');

  let used = 0;
  const budget = spec.budgetTokens || BUDGET_TOKENS;

  for (const item of resolved) {
    if (item.status !== 'ok') continue;

    const seenIn = ledger.seen[item.digest];
    if (seenIn) {
      // Already in this session's window. A reference costs a line; the content
      // costs what it cost the first time.
      referenced.push({ ...item, seenIn });
      continue;
    }
    if (used + item.tokens > budget) {
      dropped.push({ ...item, reason: `budget ${budget} would be exceeded (needs ${item.tokens} more, ${used} used)` });
      continue;
    }
    used += item.tokens;
    included.push(item);
    ledger.seen[item.digest] = spec.stepId;
  }

  return { included, referenced, dropped, missing, used, budget, ledger };
}

/** The bundle the agent reads, and the manifest a human reads afterwards. */
function render(spec, result) {
  const parts = [`# Context for ${spec.stepId}`, ''];
  for (const item of result.included) {
    parts.push(`## ${item.label || item.path}${item.section ? ` - ${item.section}` : ''}`, '', item.body, '');
  }
  if (result.referenced.length) {
    parts.push('## Already in this session', '');
    for (const r of result.referenced) {
      parts.push(`- ${r.label || r.path}${r.section ? ` - ${r.section}` : ''} (assembled for ${r.seenIn}; not repeated)`);
    }
    parts.push('');
  }
  if (result.dropped.length || result.missing.length) {
    parts.push('## Not included', '');
    for (const d of result.dropped) parts.push(`- ${d.path}: ${d.reason}`);
    for (const m of result.missing) parts.push(`- ${m.path}: ${m.status}`);
    parts.push('');
  }
  return parts.join('\n');
}

function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('usage: assemble-context.cjs <spec.json>');
    process.exit(2);
  }
  // A malformed or incomplete agent-authored spec.json is the ordinary case
  // this guards against, not the exceptional one - the whole point of this
  // file is to sit in front of an agent, so it must fail with a message that
  // names what is wrong rather than an uncaught exception and a stack trace.
  let raw;
  try {
    raw = fs.readFileSync(specPath, 'utf8');
  } catch (err) {
    console.error(`assemble-context: cannot read ${specPath}: ${err.message}`);
    process.exit(2);
  }
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (err) {
    console.error(`assemble-context: ${specPath} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.inputs)) {
    console.error(`assemble-context: ${specPath} must be an object with an "inputs" array`);
    process.exit(2);
  }
  if (!spec.stepId) {
    console.error(`assemble-context: ${specPath} must declare "stepId"`);
    process.exit(2);
  }
  const result = assemble(spec);
  const stamp = new Date().toISOString().replace(/[:.]/g, '');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bundlePath = path.join(OUT_DIR, `${spec.stepId}-${stamp}.md`);
  const bundle = render(spec, result);
  fs.writeFileSync(bundlePath, bundle);

  const manifest = {
    stepId: spec.stepId,
    sessionId: spec.sessionId || 'default',
    budgetTokens: result.budget,
    usedTokens: result.used,
    bundleTokens: tokens(bundle),
    included: result.included.map((i) => ({ path: i.path, section: i.section ?? null, tokens: i.tokens, digest: i.digest })),
    referenced: result.referenced.map((r) => ({ path: r.path, section: r.section ?? null, seenIn: r.seenIn })),
    dropped: result.dropped.map((d) => ({ path: d.path, tokens: d.tokens, reason: d.reason })),
    missing: result.missing.map((m) => ({ path: m.path, status: m.status })),
  };
  fs.writeFileSync(bundlePath.replace(/\.md$/, '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  saveLedger(result.ledger);

  console.log(`[assemble-context] ${path.relative(ROOT, bundlePath)}`);
  console.log(`[assemble-context] ${manifest.bundleTokens} tokens of ${result.budget}; ${result.included.length} included, ${result.referenced.length} referenced, ${result.dropped.length} dropped, ${result.missing.length} missing`);
  // A declared input that does not exist is the step's problem, not a warning.
  process.exit(result.missing.length ? 1 : 0);
}

module.exports = { assemble, render, extractSection, tokens, digestOf };
if (require.main === module) main();
