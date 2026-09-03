#!/usr/bin/env node
'use strict';

/**
 * verify:context-budget - what a session will read, before it reads it.
 *
 * A live session was measured at 36.8 MB, containing 139 tool results over 20 KB
 * and 5.6 MB of file reads. The ten largest were whole-file reads of documents
 * nobody needed whole: a 158 KB design doc, a 116 KB epic index read twice, a
 * 102 KB generated target list read twice, an 85 KB agent definition read twice.
 * At roughly four characters per token a 158 KB read is 40k tokens, so three of
 * them exhaust a 200k window.
 *
 * The defect is not that files grow. It is that **reading one whole costs
 * nothing at the point of decision and everything a few steps later**: the tool
 * returns success either way, and the first signal is a compaction - after which
 * the agent no longer remembers reading the file and reads it again, which
 * causes the next compaction. Re-reads are not carelessness; they are what
 * compaction does to a stateless reader.
 *
 * FOUR REMEDIES, AND THE FILE DECIDES WHICH
 * -----------------------------------------
 *   split    a document read in part - one epic out of forty. Splitting is the
 *            fix; compacting it just delays the regrowth
 *   query    generated data - target lists, status files. Never read; queried
 *   retain   logs. Bounded by a retention policy, not by editing
 *   compact  genuinely whole-read prose that has become verbose. The rarest
 *            case, and the one most often reached for: DEFECTS.md was compacted
 *            from 5,900 lines on 23 August and was back to 110 KB by the 29th,
 *            because compaction was the wrong remedy for a file that is only
 *            ever read in part
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.argv[2] || process.cwd();
const WARN_KB = Number(process.env.CONTEXT_WARN_KB || 50);
const FAIL_KB = Number(process.env.CONTEXT_FAIL_KB || 100);

/** Roughly four characters to a token. Stated, because it is an estimate. */
const tokens = (bytes) => Math.round(bytes / 4);

function sh(cmd) {
  const r = require('node:child_process').spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '' };
}

const READABLE = /\.(md|txt|json|ya?ml|csv)$/i;
const SKIP = /node_modules|[\\/]\.git[\\/]|package-lock|pnpm-lock|[\\/]dist[\\/]|[\\/]coverage[\\/]|graphify-out(-spec)?[\\/](graph|manifest)\.json|graphify-out(-spec)?[\\/]\.graphify|graphify-out(-spec)?[\\/]GRAPH_REPORT/;

// Only files GIT TRACKS can affect what an agent reads from a clean checkout, so
// the budget measures tracked files, not the whole filesystem. The old walk
// recursed everything and flagged .venv/, graphify-out/cache/, other worktrees,
// and gitignored artefacts - none of which an agent pulls, and all of which are
// noise the report should never contain (DF-BUG-8). `git ls-files` yields exactly
// the tracked set and honours .gitignore for free. Outside a git tree (or if git
// is unavailable) we fall back to the filesystem walk, so the check still runs.
function trackedFiles() {
  const r = sh('git ls-files -z');
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout
    .split('\0')
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => READABLE.test(f) && !SKIP.test(f))
    .map((f) => path.join(ROOT, f));
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (SKIP.test(full)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (READABLE.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * Which remedy this file needs.
 *
 * Derived from what the file is, not from how big it got - a 200 KB log and a
 * 200 KB epic index have the same size and nothing else in common.
 */
function remedyFor(rel) {
  const p = rel.replace(/\\/g, '/').toLowerCase();
  if (/^reports\/logs\/|\.log$/.test(p)) return 'retain';
  if (/regression-targets|_implementation_status|-targets\.txt$|\.generated\./.test(p)) return 'query';
  if (/^docs\/(epics|defects)|epics\.md$|defects\.md$/.test(p)) return 'split';
  if (/^\.claude\/agents\/|^kit\/agents\//.test(p)) return 'split';
  return 'compact';
}

const ADVICE = {
  split: 'read in part, so split it: per-item files with a thin index. Compacting only delays the regrowth',
  query: 'generated data, so query it rather than reading it whole',
  retain: 'a log, so bound it with retention and read it with --show or --tail',
  compact: 'read whole and verbose, so shorten it',
};

const files = (trackedFiles() || walk(ROOT)).map((f) => {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  let size = 0;
  try { size = fs.statSync(f).size; } catch { /* vanished mid-walk */ }
  return { rel, size, remedy: remedyFor(rel) };
});

const over = files.filter((f) => f.size >= WARN_KB * 1024).sort((a, b) => b.size - a.size);
const failing = over.filter((f) => f.size >= FAIL_KB * 1024);

/* Logs are counted as a directory rather than per file: no single log is the
 * problem, and 353 of them with no retention policy is. */
const logs = files.filter((f) => f.remedy === 'retain');
const logBytes = logs.reduce((n, f) => n + f.size, 0);
const LOG_FAIL_MB = Number(process.env.CONTEXT_LOG_FAIL_MB || 20);

console.log(`\nverify:context-budget - warn at ${WARN_KB} KB, fail at ${FAIL_KB} KB\n`);
if (over.length === 0) {
  console.log(`OK    no readable file is over ${WARN_KB} KB`);
} else {
  for (const f of over) {
    const mark = f.size >= FAIL_KB * 1024 ? 'FAIL' : 'warn';
    console.log(`${mark}  ${String(Math.round(f.size / 1024)).padStart(5)} KB  ~${String(tokens(f.size)).padStart(6)} tok  ${f.rel}`);
    console.log(`        ${ADVICE[f.remedy]}`);
  }
}

if (logs.length) {
  const mb = logBytes / (1024 * 1024);
  const mark = mb >= LOG_FAIL_MB ? 'FAIL' : 'OK  ';
  console.log(`\n${mark}  logs: ${logs.length} file(s), ${mb.toFixed(1)} MB (limit ${LOG_FAIL_MB} MB) - ${ADVICE.retain}`);
  if (mb >= LOG_FAIL_MB) failing.push({ rel: 'reports/logs', size: logBytes, remedy: 'retain' });
}

console.log('');
process.exit(failing.length ? 1 : 0);
