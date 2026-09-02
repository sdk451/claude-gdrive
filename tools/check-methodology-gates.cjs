#!/usr/bin/env node
/**
 * Verify methodology v2 gate honesty in a target project.
 * Usage: node tools/check-methodology-gates.cjs [--strict]
 *
 * Reads docs/_methodology-state.md, docs/specifications-review.md,
 * docs/codebase-design-review.md and exits non-zero on false COMPLETE.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const strict = process.argv.includes('--strict');
let fail = 0;
const warnings = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function failMsg(msg) {
  console.error(`FAIL ${msg}`);
  fail = 1;
}

function warn(msg) {
  warnings.push(msg);
  console.log(`WARN ${msg}`);
}

function ok(msg) {
  console.log(`OK  ${msg}`);
}

function parseProgressTable(text) {
  const rows = {};
  const section = text.match(/## Review progress[\s\S]*?(?=\n## |\n\*\*Overall|$)/);
  if (!section) return rows;
  for (const line of section[0].split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|[^|]+\|\s*(\w+)\s*\|/);
    if (m) rows[m[1]] = m[2].toLowerCase();
  }
  return rows;
}

function parseOverallStatus(text) {
  const m = text.match(/\*\*Overall status:\*\*\s*(PARTIAL|COMPLETE)/i);
  return m ? m[1].toUpperCase() : null;
}

function parseGenerated(text) {
  const m = text.match(/^Generated:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function parseReviewDate(text) {
  const m = text.match(/\*\*Review date:\*\*\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function hasBlockingInconsistencies(text) {
  const section = text.match(/## Blocking inconsistencies[\s\S]*?(?=\n## |$)/);
  if (!section) return false;
  const body = section[0].replace(/## Blocking inconsistencies\s*/, '').trim();
  if (!body || body.startsWith('<')) return false;
  return body.split('\n').some((l) => l.trim().startsWith('-') || l.trim().startsWith('|'));
}

function unownedAcceptedDebt(text) {
  const section = text.match(/## Technical debt advisory handoff[\s\S]*?(?=\n## |$)/);
  if (!section) return [];
  return section[0]
    .split('\n')
    .filter((line) => /^\|\s*SPEC-DEBT-\d+/i.test(line))
    .filter((line) => !line.includes('<'))
    .filter((line) => {
      const cells = line.split('|').map((c) => c.trim());
      const owner = cells[6] || '';
      const trigger = cells[7] || '';
      return !owner || !trigger;
    });
}

// --- specifications-review.md ---
const specReview = read('docs/specifications-review.md');
if (!specReview) {
  warn('docs/specifications-review.md missing — review-specifications not run');
} else {
  const progress = parseProgressTable(specReview);
  const overall = parseOverallStatus(specReview);
  const requiredSteps = ['10', '11', '12', '13', '14', '15'];

  for (const step of requiredSteps) {
    if (!progress[step]) warn(`Step ${step} missing from Review progress table`);
    else if (progress[step] === 'pending') warn(`Step ${step} still pending`);
  }

  if (!specReview.includes('Journey ↔ entity traceability') && overall === 'COMPLETE') {
    warn('Overall COMPLETE but journey ↔ entity matrix section missing');
  }

  if (overall === 'COMPLETE') {
    for (const step of requiredSteps) {
      if (progress[step] && progress[step] !== 'complete' && progress[step] !== 'skipped') {
        failMsg(`Overall COMPLETE but Step ${step} is ${progress[step]}`);
      }
    }
    if (hasBlockingInconsistencies(specReview)) {
      failMsg('Overall COMPLETE but Blocking inconsistencies is non-empty');
    }
    const debtRows = unownedAcceptedDebt(specReview);
    if (debtRows.length) {
      failMsg('Overall COMPLETE but accepted technical debt rows are missing owner/next action or review trigger');
    }
    ok('specifications-review Overall COMPLETE consistent with progress table');
  } else if (overall === 'PARTIAL') {
    ok('specifications-review Overall PARTIAL');
  } else {
    warn('specifications-review Overall status not set');
  }
}

// --- codebase-design-review freshness ---
const designReview = read('docs/codebase-design-review.md');
if (specReview && designReview) {
  const overall = parseOverallStatus(specReview);
  if (overall === 'COMPLETE') {
    const reviewDate = parseReviewDate(specReview) || parseGenerated(specReview);
    const designGen = parseGenerated(designReview);
    const preSpec = /Pre-spec run:\s*yes/i.test(designReview);
    if (preSpec) {
      failMsg('codebase-design-review marked pre-spec but spec review is COMPLETE — re-run improve-codebase-design');
    } else if (reviewDate && designGen && strict) {
      const rd = Date.parse(reviewDate);
      const dg = Date.parse(designGen);
      if (!Number.isNaN(rd) && !Number.isNaN(dg) && dg < rd) {
        failMsg('codebase-design-review older than spec review — re-run improve-codebase-design');
      }
    }
  }
}

// --- methodology state ---
const state = read('docs/_methodology-state.md');
if (state) {
  if (/brownfield-onboarding COMPLETE/i.test(state) && /PARTIAL/i.test(state)) {
    // both present — check gap table
  }
  if (/brownfield-onboarding COMPLETE/i.test(state)) {
    if (specReview && parseOverallStatus(specReview) !== 'COMPLETE') {
      failMsg('brownfield-onboarding COMPLETE logged but specifications-review not COMPLETE');
    }
  }
  if (/review-specifications COMPLETE/i.test(state) && specReview) {
    if (parseOverallStatus(specReview) === 'PARTIAL') {
      failMsg('review-specifications COMPLETE logged but specifications-review Overall is PARTIAL');
    }
  }
}

if (fail) {
  console.error('\ncheck-methodology-gates: FAILED');
  process.exit(1);
}

console.log('\ncheck-methodology-gates: passed');
if (warnings.length) {
  console.log(`${warnings.length} warning(s) — run review-specifications or improve-codebase-design as needed`);
}
process.exit(0);
