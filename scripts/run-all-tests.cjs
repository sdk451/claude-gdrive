#!/usr/bin/env node
/**
 * Run all configured test suites locally and write a combined HTML + JSON summary.
 *
 * Usage:
 *   node scripts/run-all-tests.cjs [--html reports/test-summary.html]
 *
 * Discovers npm scripts: test:unit, test:integration, test:component, test:e2e,
 * test:visual, test:a11y, test (fallback). Also runs tests/regression/regression-targets.txt
 * when present via run-targeted-tests.sh.
 *
 * A RUN THAT RAN NOTHING IS NOT A GREEN RUN. Not every project defines all seven tiers,
 * so an unconfigured tier is a legitimate skip — but if NO suite ran at all, this used to
 * print a friendly note and still exit 0, which local-ci-gate.cjs then read as "local
 * suite green" and authorised a push on the strength of zero executed tests. Zero suites
 * is now exit 1. Opt out deliberately with --allow-no-suites (or ALLOW_NO_SUITES=1) while
 * scaffolding, before foundation-cicd has wired package.json.
 *
 * The closing summary always reports the real tally and names the skipped tiers, so a
 * thin run is visible as a thin run rather than as an unqualified pass.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Build the command that runs the targeted-test script.
 *
 * Do NOT rely on bare `bash` on Windows. Where WSL is installed, the first
 * `bash` on PATH is C:\Windows\system32\bash.exe -- the WSL one -- which cannot
 * resolve a Windows-style script path. The regression lane then fails for a
 * reason that has nothing to do with the tests. Resolve Git bash by absolute
 * path and hand it forward slashes; fall back to bare `bash` only when Git bash
 * is absent (a non-Windows host, or a machine without Git for Windows).
 */
function shellQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function windowsBashPath(value) {
  return String(value).replace(/\\/g, '/');
}

function regressionTargetCommand(targetedScript, regressionTargets) {
  if (process.platform !== 'win32') {
    return `${shellQuote(targetedScript)} ${shellQuote(regressionTargets)}`;
  }
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (fs.existsSync(gitBash)) {
    return `${shellQuote(gitBash)} ${shellQuote(windowsBashPath(targetedScript))} ${shellQuote(
      windowsBashPath(regressionTargets),
    )}`;
  }
  return `bash ${shellQuote(targetedScript)} ${shellQuote(regressionTargets)}`;
}

const scope = require('./lib/regression-scope.cjs');

/** `--flag value` reader; returns null when absent. */
function arg(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : null;
}

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Files changed against the merge base. Used only to widen scope, never to
 * narrow it, so a failure here must return empty rather than throw.
 */
function changedFiles() {
  for (const base of ['origin/main', 'origin/master', 'HEAD~1']) {
    try {
      const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const list = out.split('\n').map((s) => s.trim()).filter(Boolean);
      if (list.length) return list;
    } catch {
      /* try the next base */
    }
  }
  return [];
}

const projectRoot = process.cwd();
const htmlOut =
  process.argv.includes('--html')
    ? path.resolve(process.argv[process.argv.indexOf('--html') + 1])
    : path.join(projectRoot, 'reports', 'test-summary.html');
const jsonOut = path.join(projectRoot, 'reports', 'test-summary.json');

function reapHygiene() {
  const script = path.join(projectRoot, 'scripts', 'reap-test-hygiene.cjs');
  if (!fs.existsSync(script)) return;
  spawnSync(process.execPath, [script], { cwd: projectRoot, stdio: 'inherit' });
}

/** @type {{ name: string, command: string, status: 'pass'|'fail'|'skip', durationMs: number, output: string }[]} */
const results = [];

/** Suites added by --include (story-focus opt-in), recorded in the JSON summary. */
let summaryIncludes = [];

function readPackageScripts() {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};
  } catch {
    return {};
  }
}

function runCommand(name, command) {
  const started = Date.now();
  process.stdout.write(`\n=== ${name} ===\n`);
  const child = spawnSync(command, {
    cwd: projectRoot,
    shell: true,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const output = `${child.stdout || ''}${child.stderr || ''}`.trim();
  const status = child.status === 0 ? 'pass' : 'fail';
  results.push({ name, command, status, durationMs, output: output.slice(-8000) });
  return status === 'pass';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function writeReports(startedAt) {
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    projectRoot,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    skipped: results.filter((r) => r.status === 'skip').length,
    storyFocusIncludes: summaryIncludes,
    suites: results,
  };
  fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const rows = results
    .map(
      (r) =>
        `<tr class="${r.status}"><td>${escapeHtml(r.name)}</td><td>${r.status}</td><td>${(r.durationMs / 1000).toFixed(1)}s</td><td><pre>${escapeHtml(r.output.slice(-2000))}</pre></td></tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Test summary — ${escapeHtml(path.basename(projectRoot))}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.4rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; text-align: left; }
    tr.pass td:nth-child(2) { color: #0a7; font-weight: 600; }
    tr.fail td:nth-child(2) { color: #c00; font-weight: 600; }
    tr.skip td:nth-child(2) { color: #888; }
    pre { white-space: pre-wrap; font-size: 0.8rem; max-height: 12rem; overflow: auto; margin: 0; }
    .meta { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Local test summary</h1>
  <p class="meta">Started ${escapeHtml(startedAt)} · ${summary.passed} passed · ${summary.failed} failed · ${summary.skipped} skipped</p>
  <table>
    <thead><tr><th>Suite</th><th>Status</th><th>Duration</th><th>Output (tail)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta">JSON: ${escapeHtml(jsonOut)}</p>
</body>
</html>`;
  fs.writeFileSync(htmlOut, html, 'utf8');
}

function main() {
  reapHygiene();
  const startedAt = new Date().toISOString();
  const scripts = readPackageScripts();

  // WHICH SUITES RUN IS A FUNCTION OF SCOPE.
  //
  // This loop previously ran every suite unconditionally - unit, integration,
  // component, e2e, visual and a11y - and only the regression TARGETS below were
  // scoped. So story close paid for the full e2e, visual and accessibility runs
  // every time, which is the expensive part. Scoping the targets while running
  // the whole pyramid narrowed nothing that mattered.
  //
  //   slice    the red-green loop: unit only, kept fast
  //   story    story close: the fast tiers, plus this story's regression targets
  //            and the epic's areas
  //   epic     epic close: adds component and e2e, Tess's risk-selected subset
  //   release  promotion: everything, including visual and a11y
  // The tier table lives in scripts/lib/regression-scope.cjs so the tiers and
  // the opt-in that widens them cannot drift apart. Two copies of this table is
  // the bug class that made story and full the same run.
  const ALL_SUITES = scope.SUITES_BY_SCOPE.full;

  // Scope must be resolved BEFORE the suite loop; it used to be resolved after,
  // which is why it could not influence which suites ran.
  const targetedScript = path.join(projectRoot, 'scripts', 'run-targeted-tests.sh');
  const scopeArg = arg('--scope') || process.env.TMK_REGRESSION_SCOPE || 'story';
  const storyId = arg('--story') || process.env.TMK_STORY_ID || null;
  const ledger = scope.readLedger(projectRoot);
  const resolved = scope.resolveScope({
    requested: scopeArg,
    ledger,
    isEpicClose: process.argv.includes('--epic-close'),
    changedFiles: changedFiles(),
  });
  console.log(
    `\n[regression] scope=${resolved.scope}${resolved.escalated ? ' (ESCALATED)' : ''} - ${resolved.reason}`,
  );

  const baseScope = scope.SUITES_BY_SCOPE[resolved.scope] || scope.SUITES_BY_SCOPE.story;

  // STORY-FOCUS OPT-IN.
  //
  // The tiers above are cost defaults, not a statement that visual or a11y never
  // matter before release. A story whose acceptance criteria ARE the rendered UI
  // or the accessibility behaviour cannot be called done without them, and Tess
  // nominates that coverage as the definition of done during test design.
  //
  //   npm run test:all -- --scope story --include test:visual,test:a11y
  //
  // Constraints that keep this from becoming "run everything, always":
  //   - additive only; it can never REMOVE a suite the scope already requires
  //   - each inclusion is echoed with its reason and lands in the JSON summary,
  //     so a reviewer can see the story opted in and why
  //   - perf is NOT includable here. It has its own scope (--scope perf) and is
  //     deliberately absent from every gate; see NEVER_IN_GATES in regression-scope.
  const includeArg = arg('--include') || process.env.TMK_INCLUDE_SUITES || '';
  const included = scope.resolveIncludes({ requested: includeArg, baseSuites: baseScope });

  if (included.rejected.length) {
    console.error(
      `[regression] --include rejected: ${included.rejected.join(', ')} ` +
        `(includable: ${scope.INCLUDABLE_SUITES.join(', ')}; perf runs via --scope perf)`,
    );
    process.exit(2);
  }
  if (included.includes.length) {
    console.log(
      `[regression] story-focus opt-in: ${included.includes.join(', ')} added to scope=${resolved.scope}`,
    );
  }

  summaryIncludes = included.includes;

  let exitCode = 0;
  let ranAny = false;

  for (const scriptName of ALL_SUITES) {
    if (!scripts[scriptName]) {
      results.push({
        name: scriptName,
        command: '(not configured)',
        status: 'skip',
        durationMs: 0,
        output: 'Add to package.json scripts during foundation-cicd',
      });
      continue;
    }
    if (!included.suites.includes(scriptName)) {
      // Recorded as an explicit out-of-scope skip, never as a pass. A reader of
      // this report must be able to tell "did not run" from "ran and was green".
      results.push({
        name: scriptName,
        command: `npm run ${scriptName}`,
        status: 'skip',
        durationMs: 0,
        output: `not in scope: ${resolved.scope}`,
      });
      continue;
    }
    ranAny = true;
    if (!runCommand(scriptName, `npm run ${scriptName}`)) exitCode = 1;
  }

  // -- regression, scoped -----------------------------------------------------
  // Previously this always ran the entire accumulated regression-targets.txt.
  // Because that file is append-only, story N paid for stories 1..N and the cost
  // grew quadratically across an epic. Scope is now resolved per run; see
  // scripts/lib/regression-scope.cjs for the escalation rules that stop this
  // becoming a coverage cut.
  const targetFiles = scope.targetFilesFor(projectRoot, resolved.scope, storyId);

  if (fs.existsSync(targetedScript) && targetFiles.length) {
    let regressionOk = true;
    for (const tf of targetFiles) {
      ranAny = true;
      const rel = path.relative(projectRoot, tf).replace(/\\/g, '/');
      if (!runCommand(`regression:${rel}`, regressionTargetCommand(targetedScript, tf))) {
        exitCode = 1;
        regressionOk = false;
      }
    }
    // Only a PASSING run moves the ledger. A red full pass must not reset the
    // counter and buy another window of narrow merges.
    scope.recordRun(projectRoot, {
      scope: resolved.scope,
      storyId,
      sha: headSha(),
      passed: regressionOk,
    });
  } else if (resolved.scope === 'full') {
    // A full pass that found no list ran nothing. That is not a green regression.
    console.error(
      '[regression] FULL scope requested but tests/regression/regression-targets.txt is missing or empty.',
    );
    exitCode = 1;
  } else {
    console.log('[regression] no target files for this scope - nothing to run');
  }

  const skippedNames = results.filter((r) => r.status === 'skip').map((r) => r.name);
  const ranCount = results.filter((r) => r.status !== 'skip').length;

  if (!ranAny) {
    const allowEmpty = process.argv.includes('--allow-no-suites') || process.env.ALLOW_NO_SUITES === '1';
    console.error(
      `\nNOTHING RAN: 0 test suites executed (${skippedNames.length} unconfigured: ${skippedNames.join(', ')}).`,
    );
    if (allowEmpty) {
      console.error('--allow-no-suites: accepting a zero-suite run. This proves nothing about the code.');
    } else {
      console.error(
        'A run that executed no tests is not a green run. Complete foundation-cicd to wire package.json\n' +
          'scripts, or pass --allow-no-suites if you are deliberately scaffolding.',
      );
      exitCode = 1;
    }
  }

  writeReports(startedAt);

  // Always report the real tally. A partial run must read as partial — the caller
  // (local-ci-gate.cjs) turns this exit code into permission to push.
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(
    `\n${ranCount} suite(s) executed — ${passed} passed, ${failed} failed` +
      (skippedNames.length ? `; NOT RUN: ${skippedNames.join(', ')}` : '; no tiers skipped'),
  );
  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${htmlOut}`);
  reapHygiene();
  process.exit(exitCode);
}

// The command builders are exported so a runner test can exercise them directly,
// and the guard below is what makes that safe: `require`-ing this module must NOT
// run the gate or call process.exit() mid-suite.
//
// This was added downstream, then silently removed when a kit sync copied the
// kit's copy of this file over it - the kit had a bare `main()` and did not know
// the guard existed. Requiring the module then ran the whole gate and exited 1 in
// the middle of another suite. It lives here now so the sync propagates it rather
// than clobbering it.
module.exports = { regressionTargetCommand, windowsBashPath, shellQuote };

if (require.main === module) {
  main();
}
