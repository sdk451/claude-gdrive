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
const baseline = require('./lib/regression-baseline.cjs');

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
/**
 * The current branch, so `feature/<story-id>-<slug>` can name the story
 * (E27-S21 AC2). Without this the story id comes only from `--story` or
 * `TMK_STORY_ID`, and nothing in this repository sets either -- so story scope
 * ran with `storyId === null` on every merge and quietly reduced to smoke
 * alone. Regressed once already: PR #304's kit-template sync overwrote this
 * function wholesale on 2026-08-10, and nobody noticed because the gate still
 * went green -- smoke passing is indistinguishable from smoke-plus-progression
 * passing until you check what actually ran.
 *
 * Failure returns null, which escalates to full rather than narrowing (see
 * resolveScope): an unknown story id is exactly the case this must not narrow.
 */
function scopeBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Files this run should be judged on.
 *
 * This used to be the WHOLE branch diff (`origin/main...HEAD`), which makes any
 * escalation permanent for the life of a long-lived branch: a dependency or
 * build-config file touched days ago never leaves the diff, so every subsequent
 * story escalates to full. graphene_supply ran a full sweep per story for days
 * off a 134-file branch diff carrying one `.devcontainer/Dockerfile` change.
 *
 * The question the resolver is asking is "how wide is the blast radius of THIS
 * work", so the answer must be scoped to this work. Preference order:
 *
 *   1. TMK_CHANGED_BASE, when a caller knows better than we can infer.
 *   2. The upstream tracking ref (@{u}) - on a story branch that is the same
 *      branch on the remote, so the diff is the commits not yet pushed. This is
 *      the common case mid-story and is naturally story-scoped.
 *   3. HEAD~1 - the last commit. Correct for a run straight after committing.
 *   4. The branch diff, as before, and only if nothing above produced anything.
 *
 * An EMPTY result is returned rather than falling through to a wider base when a
 * narrower one legitimately produced nothing: "this commit changed no
 * dependency files" is a real answer, and widening until something matches is
 * how the sticky behaviour arose in the first place.
 */
function changedFiles() {
  const diff = (base) => {
    try {
      const out = execSync(`git diff --name-only ${base}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return null; // ref does not resolve
    }
  };

  const explicit = process.env.TMK_CHANGED_BASE;
  if (explicit) {
    const list = diff(`${explicit}...HEAD`);
    if (list) return list;
  }

  // The branch point is the honest base for a story branch: the branch was cut
  // for this story, so everything on it IS the story's work.
  //
  // This is checked BEFORE @{u}, and HEAD~1 is gone entirely. Both of those
  // under-report, and under-reporting here is the dangerous direction - too few
  // changed files can look docs-only, and a docs-only verdict runs NOTHING.
  //
  // Observed in graphene_supply: a story branch with four commits, three of them
  // source, never pushed. With no upstream, @{u} did not resolve and the old
  // chain fell to HEAD~1 - which resolved fine and returned the LAST COMMIT
  // ONLY: two files, both under docs/. The gate called it docs-only and the
  // three source commits were never tested. The branch diff was 13 files.
  //
  // HEAD~1 was never the right answer for "what did this story change" unless
  // the story happens to be exactly one commit. It looked reasonable because it
  // usually resolves, and a plausible answer is what makes this class of bug
  // survive - the same failure the design doc's governing objective names.
  for (const base of ['origin/main', 'origin/master', 'main', 'master']) {
    const list = diff(`${base}...HEAD`);
    // A resolvable base with no differences means we are AT the branch point,
    // which is a real answer; keep looking only when the ref does not resolve.
    if (list) return list;
  }

  // No default branch to compare against - a detached checkout, or a repo whose
  // trunk is named something else. Unpushed commits are the next best evidence.
  const upstream = diff('@{u}...HEAD');
  if (upstream) return upstream;

  // Nothing resolved. Return empty rather than guessing: resolveScope treats an
  // empty change set as "could not determine" and escalates, which is the safe
  // direction. Never fall back to a narrower base to manufacture an answer.
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
  spawnSync(process.execPath, [script], { cwd: projectRoot, stdio: 'inherit', env: childEnv() });
}

/** @type {{ name: string, command: string, status: 'pass'|'fail'|'skip', durationMs: number, output: string }[]} */
const results = [];

/*
 * Resume and failed-only.
 *
 * A suite that reaches 60% in a 900s window and is cut off should not re-pay
 * that 60% on the retry, and verifying one fix should not re-run everything
 * that already passed. Prior outcomes are recorded per target, guarded by a
 * fingerprint of HEAD plus the working tree - a recorded pass belongs to the
 * code it passed against, and skipping on the strength of a stale one would
 * report a pass for a target that never ran against what is here now.
 */
const runState = require('./lib/run-state.cjs');
const RESUME_MODE = process.argv.includes('--failed-only')
  ? 'failed-only'
  : process.argv.includes('--resume')
    ? 'resume'
    : 'full';

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

/**
 * Environment for child test processes, with PYTHONHOME stripped.
 *
 * WHY THIS IS NOT PARANOIA
 * On a workstation where an MCP server or other tool is launched through `uv`,
 * `uv run` exports PYTHONHOME pointing at ITS managed interpreter. Every
 * descendant inherits it, including this gate and every test process below it.
 * Any other Python then loads the wrong standard library and dies with errors
 * that look like application bugs. Observed on graphene_supply:
 *
 *   AttributeError: module '_thread' has no attribute 'start_joinable_thread'
 *
 * That is miniconda 3.11 loading a 3.13 stdlib. It took out the Playwright web
 * server, and with it the e2e, integration and regression lanes -- so the full
 * sweep could never go green, so the regression ledger could never clear, so
 * every story kept escalating to a full sweep.
 *
 * PYTHONHOME is virtually never something a project sets deliberately: a
 * virtualenv uses VIRTUAL_ENV and its own sys.prefix. Dropping it is safe and
 * makes the gate independent of how its parent process happened to be launched.
 */
/**
 * Put the project's own virtualenv first on PATH.
 *
 * package.json test scripts invoke a bare `python -m pytest`. Bare `python`
 * resolves to whatever is first on PATH, and on a developer workstation that is
 * routinely NOT the project venv - miniconda's base env, a system Python, a
 * pyenv shim. The failure that produces is the nastiest kind: not "python not
 * found" but an ImportError deep inside an unrelated module, because the
 * interpreter is real and healthy and simply lacks the project's dependencies.
 *
 * This has now cost two separate debugging sessions in graphene_supply, both
 * ending in the same manual workaround - exporting .venv/Scripts on PATH at the
 * gate invocation. That is a fix at the call site, so it protects one repo, one
 * invocation, once.
 *
 * run-targeted-tests.sh already does this for the TARGETED path. Full-scope runs
 * go through this file instead and had no such protection - so the gap opened
 * precisely on escalation, when the full sweep runs and its result matters most.
 *
 * Silent when there is no .venv: a repo with no Python is untouched.
 */
function venvBin(root) {
  // Windows lays a venv out as .venv/Scripts, POSIX as .venv/bin. Probe for the
  // directory rather than branching on process.platform - a venv created under
  // Git Bash or WSL and used from PowerShell should still be found.
  for (const rel of [['.venv', 'Scripts'], ['.venv', 'bin']]) {
    const dir = path.join(root, ...rel);
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* not this one */
    }
  }
  return null;
}

function childEnv(extra) {
  const env = { ...process.env, ...(extra || {}) };
  if (env.PYTHONHOME) {
    delete env.PYTHONHOME;
  }

  const bin = venvBin(projectRoot);
  if (bin) {
    // Spreading process.env copies keys VERBATIM, and Windows commonly spells
    // this `Path`. Writing env.PATH when the inherited key was `Path` leaves two
    // entries and the child may read the other one - so find the real key.
    const key = Object.keys(env).find((k) => /^path$/i.test(k)) || 'PATH';
    const current = env[key] || '';
    // Skip if already leading, so repeated calls do not grow PATH without bound.
    if (!current.toLowerCase().startsWith(bin.toLowerCase())) {
      env[key] = current ? `${bin}${path.delimiter}${current}` : bin;
    }
    // Make it a properly activated venv rather than just a PATH tweak: pytest
    // subprocesses and tools that re-resolve the interpreter read VIRTUAL_ENV.
    env.VIRTUAL_ENV = path.dirname(bin);
  }
  return env;
}

/*
 * Output goes to a file, not a pipe, and the command runs inside something
 * that can kill its whole tree.
 *
 * spawnSync with piped stdio returns on EOF, not on child exit. On Windows a
 * grandchild that inherits the handle and outlives the shell - Playwright's
 * webServer starting Next.js and FastAPI - holds the pipe open, and the gate
 * hangs with every constituent suite already green. Isolated on
 * graphene-consumer, 27 August 2026: run-all-tests.cjs alone hung; every suite
 * under scope=story passed by any other path. There was also no timeout, so
 * "hangs" meant indefinitely.
 *
 * A file has no EOF to wait for. On Windows the command runs in a Job Object
 * (scripts/win/run-in-job.ps1) that dies with the wrapper, taking any
 * grandchild with it. On POSIX it runs as a process-group leader and the group
 * is swept afterwards. Either way a timeout is a return, not a hang.
 */
const COMMAND_TIMEOUT_SEC = Number.parseInt(process.env.RUN_ALL_TESTS_COMMAND_TIMEOUT_SEC || '1800', 10);

function runCommand(name, command, extraEnv) {
  const started = Date.now();
  process.stdout.write(`\n=== ${name} ===\n`);
  const logDir = path.join(projectRoot, 'reports', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const slug = name.replace(/[^A-Za-z0-9._-]+/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '');
  const logPath = path.join(logDir, `${slug}-${stamp}.log`);
  /*
   * Separate files for the two streams.
   *
   * Both used to land in one file, and the summary kept the last 8000
   * characters of the result. Observed in graphene_supply on 27 August 2026:
   * vitest emitted dozens of routine SMTP-refused stderr lines while pytest
   * genuinely failed and reported it on stdout. The combined tail retained only
   * vitest's stderr, so the report said "test:unit fail" with no usable
   * evidence - three full twenty-seven minute gate runs, each correctly failing
   * and each unable to say why.
   *
   * A file rather than a pipe, because spawnSync returns on EOF and a
   * grandchild holding the handle hangs the gate. Two files rather than two
   * pipes keeps that property while giving each stream its own retained window.
   */
  const errPath = path.join(logDir, `${slug}-${stamp}.err.log`);
  const fd = fs.openSync(logPath, 'w');
  const errFd = fs.openSync(errPath, 'w');
  fs.writeSync(fd, `# run-all-tests: ${command}\n# cwd: ${projectRoot}\n# timeout: ${COMMAND_TIMEOUT_SEC}s\n\n`);

  let child;
  if (process.platform === 'win32') {
    const ps1 = path.join(__dirname, 'win', 'run-in-job.ps1');
    child = spawnSync(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1,
        '-CommandB64', Buffer.from(command, 'utf8').toString('base64'),
        '-TimeoutSec', String(COMMAND_TIMEOUT_SEC),
        '-WorkingDirectory', projectRoot,
      ],
      {
        cwd: projectRoot,
        stdio: ['ignore', fd, errFd],
        env: childEnv(extraEnv),
        windowsHide: true,
        // Outer guard only: the wrapper enforces the real timeout and kills the job.
        timeout: (COMMAND_TIMEOUT_SEC + 60) * 1000,
      },
    );
  } else {
    child = spawnSync('/bin/sh', ['-c', command], {
      cwd: projectRoot,
      stdio: ['ignore', fd, errFd],
      env: childEnv(extraEnv),
      detached: true,
      timeout: COMMAND_TIMEOUT_SEC * 1000,
      killSignal: 'SIGTERM',
    });
    // Sweep the process group: on timeout node signalled the shell only, and on
    // a normal exit a server the test started may still be running. ESRCH is fine.
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Group already empty - nothing survived the command.
      }
    }
  }
  fs.closeSync(fd);
  fs.closeSync(errFd);

  const durationMs = Date.now() - started;
  const timedOut = child.status === 124 || (child.error && child.error.code === 'ETIMEDOUT');
  /*
   * Each stream keeps its own window. Six thousand characters for stdout, where
   * a failure summary lands, and two thousand for stderr, which is usually
   * chatter - so a noisy stream can no longer evict the quiet one that explains
   * the failure.
   */
  const readTail = (file, chars) => {
    try {
      return fs.readFileSync(file, 'utf8').trim().slice(-chars);
    } catch {
      return '';
    }
  };
  const stdoutTail = readTail(logPath, 6000);
  const stderrTail = readTail(errPath, 2000);
  let output = [
    stdoutTail && `--- stdout (tail) ---\n${stdoutTail}`,
    stderrTail && `--- stderr (tail) ---\n${stderrTail}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (!output) output = '[run-all-tests] both streams were empty; see the log files';
  if (timedOut) {
    output += `\n[run-all-tests] TIMEOUT after ${COMMAND_TIMEOUT_SEC}s - process tree killed, log: ${path.relative(projectRoot, logPath)}`;
  } else if (child.error) {
    output += `\n[run-all-tests] spawn error: ${child.error.message}`;
  }
  const status = child.status === 0 && !child.error ? 'pass' : 'fail';
  process.stdout.write(
    `[run-all-tests] ${name}: ${status} in ${(durationMs / 1000).toFixed(1)}s -> ${path.relative(projectRoot, logPath)}\n`,
  );
  results.push({ name, command, status, durationMs, output, log: path.relative(projectRoot, logPath) });
  return status === 'pass';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Set by main() when --only is in force. Module-scoped because writeReports() is
 * reached from several places and threading a parameter through each of them is
 * how one of them ends up not passing it - and the one that forgets writes a
 * report that reads as a verdict.
 */
let diagnosticRun = false;

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
    // Consumers read this file to decide whether the gate passed. A diagnostic run
    // ran a subset by construction, so the record has to say so - an unmarked
    // report is indistinguishable from a real one, which is the whole risk.
    diagnostic: diagnosticRun,
    /*
     * A resumed run skipped targets on the strength of a previous run's result.
     * That is legitimate and it is not a full pass, so the record says which and
     * names what was skipped - the same reason `diagnostic` exists: an unmarked
     * partial report is indistinguishable from a real one.
     */
    resumed: RESUME_MODE !== 'full',
    resumeMode: RESUME_MODE,
    skippedByResume: globalThis.__resumeSkipped || [],
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

/**
 * Delete the previous run's junit before this one starts (E27-S21 AC4).
 *
 * `reports/` is not cleaned between runs, and every consumer downstream sums
 * whatever it finds there. Under a narrowed scope that is a correctness
 * problem, not just untidiness: a story that runs two target files inherits
 * the reported coverage of every suite anyone ran on that checkout, including
 * runs that failed. `verify-test-reports.cjs` refuses stale reports (see that
 * file); clearing them here is what keeps that refusal from firing on every
 * ordinary run.
 *
 * Safe to do unconditionally at the top of the run: everything in this
 * process that writes junit does so after this point.
 */
function pruneStaleJunit() {
  const dir = path.join(projectRoot, 'reports');
  if (!fs.existsSync(dir)) return;
  const stack = [dir];
  let removed = 0;
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const p = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (/junit\.xml$/i.test(entry.name)) {
        fs.rmSync(p, { force: true });
        removed += 1;
      }
    }
  }
  if (removed) console.log(`[regression] cleared ${removed} junit report(s) from a previous run`);
}

function main() {
  reapHygiene();
  pruneStaleJunit();
  const startedAt = new Date().toISOString();
  const scripts = readPackageScripts();

  // Resume / failed-only: loaded once so every skip decision this run makes,
  // and the state this run eventually writes, agree on the same fingerprint.
  const resumeFingerprint = runState.fingerprint(projectRoot);
  const resumeState = runState.loadState(projectRoot);
  globalThis.__resumeSkipped = [];

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
  const storyId = arg('--story') || process.env.TMK_STORY_ID || (() => {
    const branch = scopeBranch();
    // ANCHORED ON THE STORY-ID SHAPE, NOT THE BRANCH PREFIX.
    //
    // This required `feature/`, and the estate does not work that way. Story
    // CLOSE - the moment this gate runs - happens on `chore/<STORY>-mark-done`,
    // which failed the anchor, so storyId came back null with the id sitting
    // right there in the branch name. graphene_infra matched 3 of its 53
    // branches; graphene_engine 10 of 43.
    //
    // Two consequences, and the quieter one is worse. The ledger recorded those
    // runs as 'unknown' (see regression-scope.cjs), and targetFilesFor() skips
    // the story's own progression file when storyId is falsy - so story scope
    // fell back to smoke alone. As the note above already warned, smoke passing
    // is indistinguishable from smoke-plus-progression passing until you check
    // what actually ran.
    //
    // `master`, `main`, `release/v1.2.0` and `docs/E49-<epic>` still yield null,
    // which is correct: none of them names a story.
    //
    // Extracted VERBATIM, not case-normalised: targetFilesFor() builds
    // `docs/tests/<storyId>-targets.txt` from this value, so folding the case
    // would break the lookup in any repo that spells its files differently.
    const m = branch && branch.match(/(?:^|\/)([A-Za-z]+\d+-[Ss]\d+)(?:[-_/.]|$)/);
    return m ? m[1] : null;
  })();
  // Resolved once and reused at both call sites below (recordRun, writeBaseline).
  // The commit does not change mid-run, so a second `git rev-parse HEAD` shell-out
  // for the same value is pure overhead, not a freshness guarantee.
  const sha = headSha();
  const ledger = scope.readLedger(projectRoot);
  const knownBaseline = baseline.readBaseline(projectRoot, scope.ledgerRoot);
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
  //     deliberately absent from every gate; see SUITES_BY_SCOPE in regression-scope.
  const includeArg = arg('--include') || process.env.TMK_INCLUDE_SUITES || '';
  const included = scope.resolveIncludes({ requested: includeArg, baseSuites: baseScope });

  // `--only <suite>[,<suite>]` - the DIAGNOSTIC run.
  //
  // Reported from graphene_supply: a gate run failed on one e2e suite, suspected
  // flake, and the rerun re-executed unit and integration too against an identical
  // tree. There was no way to scope down, so the verdict instrument was used to
  // test a hypothesis.
  //
  // What matters here is NOT that this runs less. It is that it CANNOT PRODUCE A
  // VERDICT: no ledger entry, no debt cleared, and everything it writes says so.
  // The moment a narrow run can clear the gate it will be used to clear the gate,
  // which is the failure this kit has spent a week removing - a green result that
  // verified less than it appears to.
  //
  // For a hypothesis about specific tests rather than a whole suite, prefer
  // `scripts/run-targeted-tests.sh <targets-file>`, which never touches the ledger
  // at all because it is not this runner.
  const onlyArg = arg('--only') || '';
  const diagnostic = Boolean(onlyArg.trim());
  diagnosticRun = diagnostic;
  const onlySuites = onlyArg.split(',').map((s) => s.trim()).filter(Boolean);

  // Ask the library which suites apply, given what this repo actually defines.
  // A repo with no tiered scripts falls back to the catch-all, and is told so -
  // "ran the whole suite" and "ran the story tier" are different facts.
  const chosen = scope.resolveSuites(resolved.scope, Object.keys(scripts));

  if (diagnostic) {
    // An unrecognised name is an ERROR, not a silent skip. A typo must never read
    // as "nothing to do, all good" - that is the same shape as every other defect
    // this file now guards against.
    // `regression` is not an npm script - it is the targets-file pass. It is the
    // most useful thing to isolate (it is where flaky e2e lives), so it has to be
    // nameable even though it never appears in package.json.
    const known = new Set([
      'regression', ...scope.INCLUDABLE_SUITES, ...Object.keys(scripts), ...chosen.suites,
    ]);
    const unknown = onlySuites.filter((s) => !known.has(s));
    if (unknown.length) {
      console.error(
        `\n--only names ${unknown.length} suite(s) this repo does not define: ${unknown.join(', ')}.\n` +
        `Known: ${[...known].sort().join(', ')}`,
      );
      process.exit(1);
    }
    console.log(
      `\n[diagnostic] --only ${onlySuites.join(', ')} - this is a DIAGNOSTIC run.\n` +
      '[diagnostic] It records no regression ledger entry, clears no debt, and is not a gate result.\n' +
      '[diagnostic] Re-run the full gate for a verdict.',
    );
  }
  if (chosen.untiered) {
    console.log(
      `[regression] this repo defines no tiered test scripts for scope=${resolved.scope}; ` +
      `falling back to \`npm run ${scope.CATCH_ALL_SUITE}\` - this is an UNTIERED run, not a scoped one.`,
    );
  }

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
    if (diagnostic && !onlySuites.includes(scriptName)) continue;
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
    // `chosen.suites` is `baseScope` filtered down to scripts this repo actually
    // defines; `included.suites` is `baseScope.concat(included.includes)`,
    // unfiltered. The `continue` above already guarantees `scriptName` is
    // defined by this point in the loop, so for it specifically the filtering
    // `chosen.suites` applies is a no-op - `chosen.suites.includes(scriptName)`
    // and `baseScope.includes(scriptName)` agree on every reachable scriptName.
    // Testing `chosen.suites.concat(included.includes).includes(scriptName)`
    // alongside `included.suites.includes(scriptName)` was therefore checking
    // the same set against itself under two names.
    const applies = chosen.untiered
      ? chosen.suites.includes(scriptName)
      : included.suites.includes(scriptName);
    if (!applies) {
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
    if (RESUME_MODE !== 'full') {
      const plan = runState.planFromState([scriptName], resumeState, resumeFingerprint, RESUME_MODE);
      if (plan.skipped.length) {
        results.push({
          name: scriptName,
          command: `npm run ${scriptName}`,
          status: 'skip',
          durationMs: 0,
          output: `resume: ${plan.reason}`,
        });
        globalThis.__resumeSkipped.push(scriptName);
        continue;
      }
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

  // Minimal glob matcher for coverage globs: ** matches across separators, *
  // within a segment. Self-contained so this lane depends on nothing external.
  const globToRe = (glob) => {
    let re = '';
    for (let i = 0; i < glob.length; i += 1) {
      const c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') { re += '.*'; i += 1; if (glob[i + 1] === '/') i += 1; }
        else re += '[^/]*';
      } else if ('\\^$+?.()|{}[]'.includes(c)) { re += '\\' + c; }
      else re += c;
    }
    return new RegExp('^' + re + '$');
  };
  let gateConfig = null;
  try {
    gateConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'gate.config.json'), 'utf8'));
  } catch { gateConfig = null; }

  const regressionRequested = !diagnostic || onlySuites.includes('regression');

  // At full scope, most regression targets are redundant: they are tests that
  // already ran as part of the suites full executes wholesale (pytest tests/unit,
  // playwright test, vitest run). Re-running them is the slowest redundant step
  // on a full sweep, for zero extra coverage. But NOT every target is covered - a
  // repo may have targets outside the full suites' directories (a ci/tests file, a
  // tests/scripts runbook check), and those must still run at full scope or the
  // skip becomes a silent coverage cut.
  //
  // So the skip is opt-in and per-target, driven by gate.config.json:
  //   "fullScopeCoverageGlobs": ["apps/*/tests/unit/**", "tests/e2e/**", ...]
  // A target matching one of those globs is already covered by a full suite and is
  // skipped at full scope; a target matching none still runs. Absent config skips
  // nothing - the safe default preserves current behaviour for repos that have not
  // declared what their full suites cover.
  const fullCoverageGlobs = (gateConfig && Array.isArray(gateConfig.fullScopeCoverageGlobs))
    ? gateConfig.fullScopeCoverageGlobs
    : [];
  const coveredAtFull = (relPath) =>
    resolved.scope === 'full'
    && !onlySuites.includes('regression')
    && fullCoverageGlobs.some((g) => globToRe(g).test(relPath));
  if (fs.existsSync(targetedScript) && targetFiles.length && regressionRequested) {
    let skippedRedundant = 0;
    for (const tf of targetFiles) {
      const rel = path.relative(projectRoot, tf).replace(/\\/g, '/');
      const name = `regression:${rel}`;
      if (coveredAtFull(rel)) {
        // Already executed by a full suite this run - skip, do not re-run.
        skippedRedundant += 1;
        continue;
      }
      if (RESUME_MODE !== 'full') {
        const plan = runState.planFromState([name], resumeState, resumeFingerprint, RESUME_MODE);
        if (plan.skipped.length) {
          results.push({
            name,
            command: regressionTargetCommand(targetedScript, tf),
            status: 'skip',
            durationMs: 0,
            output: `resume: ${plan.reason}`,
          });
          globalThis.__resumeSkipped.push(name);
          continue;
        }
      }
      ranAny = true;
      if (!runCommand(name, regressionTargetCommand(targetedScript, tf))) {
        exitCode = 1;
      }
    }
    if (skippedRedundant > 0) {
      console.log(
        `[regression] scope=full - skipped ${skippedRedundant} of ${targetFiles.length} ` +
        `target(s) already covered by the full suites (see fullScopeCoverageGlobs in ` +
        `gate.config.json); ran ${targetFiles.length - skippedRedundant} not covered elsewhere.`);
    }
    // Only a PASSING run moves the ledger. A red full pass must not reset the
    // counter and buy another window of narrow merges.
    //
    // This used to check only whether the regression TARGETS themselves
    // passed, so a full run with a broken unit or integration suite but clean
    // regression targets still reset `storiesSinceFull` to zero - clearing the
    // very debt the ledger exists to surface. `exitCode` already accumulates
    // every suite this run executed, including the loop above, so it is the
    // correct "did this run pass" signal.
    // THE GUARANTEE. A diagnostic run records nothing: it neither accrues debt nor
    // clears it. `--scope full --only <one suite>` is the case that matters - a
    // passing full run normally resets storiesSinceFull, and one suite must not buy
    // a fresh window of narrow merges.
    if (!diagnostic) {
      scope.recordRun(projectRoot, {
        scope: resolved.scope,
        storyId,
        sha,
        passed: exitCode === 0,
      });
    }
  } else if (resolved.scope === 'full' && regressionRequested) {
    // A full pass that found no list ran nothing. That is not a green regression.
    //
    // `&& regressionRequested` matters. Scope arrives from TMK_REGRESSION_SCOPE,
    // which every real merge-gate invocation sets to `full` - and it is inherited
    // by anything the gate spawns. So a `--only test:unit` diagnostic run nested
    // inside one sees scope=full, never asks for regression targets, and was then
    // failed for not having them. Reported from graphene_engine, where it broke
    // only-flag.test.cjs 100% reproducibly and was first mistaken for flakiness.
    //
    // The guard is about a FULL RUN that verified nothing. A diagnostic run
    // deliberately verified one named thing, which is the whole point of --only:
    // it cannot clear the gate, so it has nothing to be green about.
    console.error(
      '[regression] FULL scope requested but tests/regression/regression-targets.txt is missing or empty.',
    );
    exitCode = 1;
  } else {
    console.log('[regression] no target files for this scope - nothing to run');
  }

  const skippedNames = results.filter((r) => r.status === 'skip').map((r) => r.name);
  const ranCount = results.filter((r) => r.status !== 'skip').length;

  // A --resume/--failed-only run that skips EVERY target is not the same
  // defect as an unwired repo: it is the feature working exactly as intended
  // - the last run already knew all of it passed (or nothing had failed), so
  // there was truly nothing left to verify. Without this carve-out, the run
  // that most cleanly proves --resume is doing its job trips the same
  // "nothing ran" failure as a repo with no scripts configured at all.
  const resumeSkippedNames = new Set(globalThis.__resumeSkipped || []);
  const allSkipsAreResume = skippedNames.length > 0 && skippedNames.every((n) => resumeSkippedNames.has(n));

  if (!ranAny && allSkipsAreResume) {
    console.log(
      `\n[resume] nothing to run - all ${skippedNames.length} target(s) already known to pass ` +
        `(mode: ${RESUME_MODE}). Not a zero-suite run: see resumeMode/skippedByResume in the summary.`,
    );
  } else if (!ranAny) {
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

  // A failure the repo already had is not this change's to fix.
  //
  // The ledger ceiling escalates to full scope precisely so accumulated debt
  // gets SURFACED. It should not also make that debt BLOCKING for whoever
  // happens to trip the counter: in graphene_supply, story E27-S2 was green on
  // its own progression and regression targets and still could not merge,
  // because escalation pulled in seven cross-epic failures and a targets-file
  // line broken weeks earlier. That block is self-perpetuating - the merge is
  // what would have cleared the counter.
  //
  // So: a failure present at the last recorded full-scope baseline is reported
  // and does not block; a failure that is NOT is a regression this change owns.
  // With no baseline at all, everything blocks - an unknown repo is not a
  // forgiven one.
  if (exitCode !== 0) {
    const cls = baseline.classifyFailures(results, knownBaseline);
    if (cls.blocking.length === 0 && cls.preExisting.length > 0) {
      console.log(
        `\n[baseline] ${cls.preExisting.length} pre-existing failure(s), 0 new:\n` +
          cls.preExisting.map((n) => `  - ${n}`).join('\n') +
          `\n[baseline] recorded at ${knownBaseline.sha || 'unknown sha'}` +
          ` (${knownBaseline.at || 'unknown time'}).` +
          `\n[baseline] NOT blocking this change. This debt is the repository's and` +
          ` still needs clearing.`,
      );
      exitCode = 0;
    } else if (cls.preExisting.length > 0) {
      console.log(
        `\n[baseline] ${cls.blocking.length} NEW failure(s) - blocking:\n` +
          cls.blocking.map((n) => `  - ${n}`).join('\n') +
          `\n[baseline] plus ${cls.preExisting.length} pre-existing, not counted against you.`,
      );
    }
    if (cls.resolved.length > 0) {
      console.log(
        `\n[baseline] ${cls.resolved.length} baseline failure(s) now PASS:\n` +
          cls.resolved.map((n) => `  - ${n}`).join('\n') +
          `\n[baseline] re-run a green full scope to tighten the baseline, or it keeps` +
          ` forgiving these.`,
      );
    }
  }

  // Only a full pass that is GREEN may write the baseline - see writeBaseline()
  // for the "only full scope" half of this rule. This half is what keeps a
  // genuine NEW regression from being folded into the baseline as "known" by
  // the very run it broke: without the exitCode check, a full pass that stays
  // blocked (a real regression, not forgiven debt) still overwrote the
  // baseline to include that failure, so the next run treated it as
  // pre-existing and stopped blocking on it - one bad run permanently
  // laundered its own regression into accepted debt.
  if (resolved.scope === 'full' && exitCode === 0) {
    baseline.writeBaseline(
      projectRoot,
      { scope: resolved.scope, sha, results },
      scope.ledgerRoot,
    );
  }

  // Record this run for the next --resume/--failed-only. A target skipped
  // BY RESUME never actually ran, so its outcome here is 'skip' - saving that
  // literally would overwrite a known pass with "unknown" and make the next
  // --resume re-run it, one call after this one decided it could be trusted.
  // Carry the prior recorded status forward for exactly those targets; every
  // target that actually ran this time reports its real, fresh outcome.
  const priorTargets = (resumeState && resumeState.targets) || {};
  const stateResults = results.map((r) =>
    resumeSkippedNames.has(r.name) && priorTargets[r.name]
      ? { name: r.name, status: priorTargets[r.name] }
      : { name: r.name, status: r.status },
  );
  runState.saveState(projectRoot, stateResults, resumeFingerprint);

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
