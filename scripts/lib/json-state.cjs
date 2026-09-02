'use strict';

/**
 * Read/write helpers for the small JSON state files under `reports/` -
 * the regression ledger and the regression baseline.
 *
 * Both regression-scope.cjs and regression-baseline.cjs independently
 * duplicated the same "read, tolerate anything, never throw" /
 * "mkdir then pretty-print with a trailing newline" pair. Extracted here so
 * there is one place that decides how these files are read and written; the
 * per-file defaulting of individual fields (what "no ledger" or "no baseline"
 * means) stays with each caller, because that meaning is domain-specific.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Parse a JSON file's contents.
 *
 * Returns `undefined` - never throws - when the file is missing or its
 * contents are not valid JSON. Deliberately does NOT coerce the parsed value:
 * a file containing the literal `null`, `0`, or an array is returned as-is,
 * so a caller that reads a field off the result (e.g. `d.sha`) sees exactly
 * what plain property access on that value would have produced before this
 * helper existed - `undefined` for a primitive, a thrown-then-caught error
 * for `null`. Callers distinguish "nothing to read" from "read something
 * unexpected" with `state == null` (loose, so it also catches a literal
 * `null` in the file) before touching fields on the result.
 */
function readJsonState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Pretty-print `data` as JSON with a trailing newline, creating the parent directory first. */
function writeJsonState(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

module.exports = { readJsonState, writeJsonState };
