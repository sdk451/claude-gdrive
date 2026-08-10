'use strict';

// Registers a git worktree as a serena project so symbol search works inside it.
//
// Serena registers projects by absolute path in ~/.serena/serena_config.yml. A
// worktree is a distinct path, so a session started in one fails with:
//
//   Error: No active project. Ask the user to provide the project path ...
//
// Measured before this existed: 0 serena tool calls across 43 sessions in 7 days.
//
// It indexes the WORKTREE, not the canonical repo. Resolving back to the canonical
// checkout via `git rev-parse --git-common-dir` would make the error disappear and
// would be wrong: that checkout is on a different branch, so symbol search would
// silently answer about different code - worst exactly when the branch has diverged,
// which is the point of the branch.
//
// Node, not PowerShell, per the ADR-0003 cross-platform contract.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CONFIG = path.join(os.homedir(), '.serena', 'serena_config.yml');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function isWorktree(dir) {
  // In a linked worktree, .git is a file and git-dir differs from git-common-dir.
  try {
    const gd = path.resolve(dir, git(['rev-parse', '--absolute-git-dir'], dir));
    const gc = path.resolve(dir, git(['rev-parse', '--git-common-dir'], dir));
    return gd !== gc;
  } catch {
    return false;
  }
}

function repoRoot(dir) {
  try { return git(['rev-parse', '--show-toplevel'], dir); } catch { return null; }
}

function canonicalRoot(dir) {
  try { return path.dirname(path.resolve(dir, git(['rev-parse', '--git-common-dir'], dir))); } catch { return null; }
}
// Minimal targeted edit of the `projects:` list. Deliberately not a YAML parser:
// serena_config.yml carries comments and structure we must not disturb, and adding
// a yaml dependency to a kit tool is not worth it for one list.
function readProjects(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^projects:\s*$/.test(l));
  if (start === -1) return null;
  let end = start + 1;
  const entries = [];
  while (end < lines.length && /^\s*-\s+/.test(lines[end])) {
    entries.push(lines[end].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
    end++;
  }
  return { lines, start, end, entries };
}

function samePath(a, b) {
  const n = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
  return n(a) === n(b);
}

function addProject(worktree) {
  if (!fs.existsSync(CONFIG)) return { ok: false, reason: 'serena_config.yml not found at ' + CONFIG };
  const text = fs.readFileSync(CONFIG, 'utf8');
  const parsed = readProjects(text);
  if (!parsed) return { ok: false, reason: 'no projects: block in serena_config.yml' };
  if (parsed.entries.some((e) => samePath(e, worktree))) {
    return { ok: true, changed: false, reason: 'already registered' };
  }
  const out = parsed.lines.slice(0, parsed.end)
    .concat(['- ' + worktree], parsed.lines.slice(parsed.end));
  fs.copyFileSync(CONFIG, CONFIG + '.bak');
  fs.writeFileSync(CONFIG, out.join('\n'), 'utf8');
  return { ok: true, changed: true };
}

function removeProject(worktree) {
  if (!fs.existsSync(CONFIG)) return { ok: false, reason: 'serena_config.yml not found' };
  const text = fs.readFileSync(CONFIG, 'utf8');
  const parsed = readProjects(text);
  if (!parsed) return { ok: false, reason: 'no projects: block' };
  const keep = [];
  let removed = false;
  for (let i = parsed.start + 1; i < parsed.end; i++) {
    const entry = parsed.lines[i].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
    if (samePath(entry, worktree)) { removed = true; continue; }
    keep.push(parsed.lines[i]);
  }
  if (!removed) return { ok: true, changed: false, reason: 'not registered' };
  const out = parsed.lines.slice(0, parsed.start + 1)
    .concat(keep, parsed.lines.slice(parsed.end));
  fs.copyFileSync(CONFIG, CONFIG + '.bak');
  fs.writeFileSync(CONFIG, out.join('\n'), 'utf8');
  return { ok: true, changed: true };
}

// Serena's pinned revision requires a `languages:` key. project.yml files written
// before that schema change load as:
//
//   Failed to load project configuration for <path>: 'languages'.
//   This project will be skipped.
//
// Skipped silently - the session starts, symbol tools are advertised, and every
// lookup fails. Four projects on this workstation were in that state. Registration
// alone would faithfully copy such a config into a worktree, so repair it here.
const LANGUAGE_BY_EXT = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript', '.jsx': 'typescript',
  '.py': 'python', '.tf': 'terraform', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.kt': 'kotlin',
};
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', 'graphify-out']);

function detectLanguages(root, budget = 4000) {
  const seen = new Set();
  const stack = [root];
  let scanned = 0;
  while (stack.length && scanned < budget) {
    let dir;
    try { dir = stack.pop(); } catch { break; }
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(path.join(dir, e.name));
        continue;
      }
      scanned++;
      const lang = LANGUAGE_BY_EXT[path.extname(e.name).toLowerCase()];
      if (lang) seen.add(lang);
    }
  }
  return [...seen];
}

/**
 * Ensure project.yml carries a `languages:` key. Returns what it did rather than
 * throwing: a project that cannot be repaired should warn loudly and still
 * register, because a degraded symbol layer beats a failed worktree creation.
 */
function ensureLanguages(ymlPath, root) {
  let text;
  try { text = fs.readFileSync(ymlPath, 'utf8'); } catch (e) { return { ok: false, reason: e.message }; }
  if (/^languages:/m.test(text)) return { ok: true, changed: false };

  const langs = detectLanguages(root);
  if (!langs.length) {
    return { ok: false, changed: false, reason: 'no recognised source files; serena will skip this project' };
  }
  const block = 'languages:\n' + langs.map((l) => '- ' + l).join('\n') + '\n';
  const out = /^project_name:.*$/m.test(text)
    ? text.replace(/^(project_name:.*)$/m, '$1\n' + block.trimEnd())
    : block + text;
  try { fs.writeFileSync(ymlPath, out, 'utf8'); } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, changed: true, languages: langs };
}

// A worktree shares its branch's tracked files. Rewriting project_name there to
// keep it distinct from the canonical checkout therefore dirties a TRACKED file,
// and the rename gets committed - which is exactly what happened: the canonical
// autonomous-swe-kit repo shipped project_name
// "autonomous-swe-kit__execution-substrate" to master, so the source repo
// identified itself as one of its own worktrees.
//
// The name only affects activate-by-name disambiguation; registration and symbol
// search work off the path either way. A shared name is a much smaller problem
// than poisoning the repository, so when project.yml is tracked we leave it alone
// and say so.
function isTracked(root, relPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relPath],
      { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

// The worktree inherits .serena/project.yml from the branch, but project_name must
// be unique or serena will collide it with the canonical checkout.
function ensureProjectYml(worktree, canonical) {
  const dir = path.join(worktree, '.serena');
  const file = path.join(dir, 'project.yml');
  const base = path.basename(canonical || worktree);
  const name = base + '__' + path.basename(worktree);

  if (!fs.existsSync(file)) {
    const src = canonical && path.join(canonical, '.serena', 'project.yml');
    if (src && fs.existsSync(src)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, file);
    } else {
      return { ok: false, reason: 'no project.yml in worktree or canonical repo; run `serena project generate-yml` there first' };
    }
  }
  let text = fs.readFileSync(file, 'utf8');
  const tracked = isTracked(worktree, '.serena/project.yml');
  let effectiveName = name;
  if (tracked) {
    const current = /^project_name:\s*"?([^"\n]*)"?/m.exec(text);
    effectiveName = current ? current[1] : name;
  } else if (/^project_name:/m.test(text)) {
    text = text.replace(/^project_name:.*$/m, 'project_name: "' + name + '"');
  } else {
    text = 'project_name: "' + name + '"\n' + text;
  }
  fs.writeFileSync(file, text, 'utf8');

  const langs = ensureLanguages(file, worktree);
  const out = { ok: true, name: effectiveName, sharedName: tracked };
  if (!langs.ok) return { ...out, warning: 'languages: ' + langs.reason };
  return { ...out, languagesAdded: langs.changed ? langs.languages : null };
}
function register(dir) {
  const root = repoRoot(dir);
  if (!root) return { ok: false, reason: 'not inside a git repository' };
  if (!isWorktree(dir)) return { ok: true, changed: false, reason: 'canonical checkout, nothing to register', root };
  const canonical = canonicalRoot(dir);
  const yml = ensureProjectYml(root, canonical);
  if (!yml.ok) return { ok: false, reason: yml.reason, root };
  const added = addProject(root);
  return { ...added, root, canonical, name: yml.name };
}

function deregister(dir) {
  const root = repoRoot(dir) || path.resolve(dir);
  return { ...removeProject(root), root };
}

function status(dir) {
  const root = repoRoot(dir);
  const wt = root ? isWorktree(dir) : false;
  let registered = false;
  if (root && fs.existsSync(CONFIG)) {
    const parsed = readProjects(fs.readFileSync(CONFIG, 'utf8'));
    registered = !!parsed && parsed.entries.some((e) => samePath(e, root));
  }
  return { root, isWorktree: wt, registered, config: CONFIG };
}

if (require.main === module) {
  const cmd = process.argv[2] || 'status';
  const dir = process.argv[3] || process.cwd();
  try {
    if (cmd === 'register') {
      const r = register(dir);
      if (!r.ok) { console.error('serena-project: ' + r.reason); process.exit(1); }
      console.log(r.changed
        ? 'REGISTERED ' + r.root + (r.name ? '  as ' + r.name : '')
        : 'OK         ' + r.root + '  (' + r.reason + ')');
    } else if (cmd === 'deregister') {
      const r = deregister(dir);
      console.log(r.changed ? 'DEREGISTERED ' + r.root : 'OK           ' + r.root + '  (' + r.reason + ')');
    } else if (cmd === 'repair') {
      const root = repoRoot(dir) || path.resolve(dir);
      const yml = path.join(root, '.serena', 'project.yml');
      if (!fs.existsSync(yml)) { console.error('serena-project: no .serena/project.yml at ' + root); process.exit(1); }
      const r = ensureLanguages(yml, root);
      if (!r.ok) { console.error('serena-project: ' + r.reason); process.exit(1); }
      console.log(r.changed ? 'REPAIRED ' + root + '  languages: ' + r.languages.join(', ')
                            : 'OK       ' + root + '  (languages already present)');
    } else {
      const s = status(dir);
      console.log('root:       ' + s.root);
      console.log('worktree:   ' + s.isWorktree);
      console.log('registered: ' + s.registered);
    }
  } catch (err) {
    console.error('serena-project: ' + (err && err.message));
    process.exit(1);
  }
}

module.exports = { register, deregister, status, ensureLanguages, detectLanguages, isTracked, isWorktree, repoRoot, canonicalRoot, samePath, readProjects };