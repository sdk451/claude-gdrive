#!/usr/bin/env node
/**
 * worktree.cjs — the kit's single point of contact for git worktrees.
 *
 * Wraps `git worktree` with the kit's invariants so the Implementer can run
 * stories in parallel, each in its own working directory locked to one branch,
 * all sharing the primary repo's single object database.
 *
 * Cross-platform (Node, no dependencies) — chosen over bash so it runs
 * identically on Windows, macOS, and Linux. See .cursor/rules/50-worktrees.mdc.
 *
 * Usage:
 *   node scripts/worktree.cjs create <story-id> [--slug <slug>] [--base <ref>]
 *   node scripts/worktree.cjs path   <story-id>
 *   node scripts/worktree.cjs list   [--json]
 *   node scripts/worktree.cjs remove <story-id> [--force]
 *   node scripts/worktree.cjs prune
 *
 * `create` prints the absolute worktree path on its LAST stdout line so callers
 * can capture it:  WT=$(node scripts/worktree.cjs create E2-S1 | tail -1)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── Project root resolution ────────────────────────────────────────────────
// Find the nearest ancestor containing docs/config.yaml (the primary worktree).
function findProjectRoot(start) {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'docs', 'config.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start; // fall back to cwd
    dir = parent;
  }
}

const ROOT = findProjectRoot(process.cwd());

// ── Tiny config reader (regex, no YAML dependency — matches kit convention) ──
function readConfig() {
  const configPath = path.join(ROOT, 'docs', 'config.yaml');
  let text = '';
  try { text = fs.readFileSync(configPath, 'utf8'); } catch {}
  const scalar = (key, fallback) => {
    const m = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
    if (!m) return fallback;
    return m[1].replace(/^["']|["']$/g, '').trim();
  };
  const num = (key, fallback) => {
    const v = scalar(key, null);
    const n = v == null ? NaN : parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    branchPrefix: scalar('branch_prefix', 'feature'),
    requirementsPath: scalar('requirements_path', 'project/requirements'),
    worktreesDir: scalar('worktrees_dir', '.worktrees'),
    maxConcurrent: num('max_concurrent_worktrees', 1),
    bootstrap: scalar('worktree_bootstrap', 'npm install'),
    portBase: num('worktree_port_base', 3000),
  };
}

// ── git helpers ─────────────────────────────────────────────────────────────
function git(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    shell: false,
  });
  return { code: res.status ?? 1, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() };
}

function gitOk(args, opts) {
  const r = git(args, opts);
  if (r.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${r.err || r.out}`);
  }
  return r.out;
}

/**
 * Detect the repo's default branch instead of assuming `main` — works whether
 * the host repo defaults to main, master, or anything else.
 */
function defaultBranch() {
  // 1. Canonical: origin/HEAD is a symbolic ref to the remote's default branch.
  const sym = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (sym.code === 0 && sym.out) return sym.out.replace(/^origin\//, '');
  // 2. Probe the usual defaults on the remote.
  for (const cand of ['main', 'master']) {
    if (git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${cand}`]).code === 0) return cand;
  }
  // 3. Last resort: the current local branch, else fall back to main.
  const cur = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return cur.code === 0 && cur.out && cur.out !== 'HEAD' ? cur.out : 'main';
}

/** Parse `git worktree list --porcelain` into [{path, branch}]. */
function listGitWorktrees() {
  const out = git(['worktree', 'list', '--porcelain']).out;
  const trees = [];
  let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length).trim(), branch: null };
      trees.push(cur);
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice('branch '.length).replace('refs/heads/', '').trim();
    }
  }
  return trees;
}

function which(cmd) {
  const probe = process.platform === 'win32' ? ['where', cmd] : ['command', '-v', cmd];
  const res = spawnSync(probe[0], probe.slice(1), { encoding: 'utf8', shell: process.platform === 'win32' });
  return res.status === 0;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function storyFile(cfg, storyId) {
  return path.join(ROOT, cfg.requirementsPath, `${storyId}.md`);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Derive a branch slug from the story file title, or fall back to the id. */
function deriveSlug(cfg, storyId, override) {
  if (override) return slugify(override);
  try {
    const text = fs.readFileSync(storyFile(cfg, storyId), 'utf8');
    const fm = text.match(/^title:\s*(.+)$/m);
    const heading = text.match(/^#\s+(.+)$/m);
    const raw = (fm && fm[1]) || (heading && heading[1]) || storyId;
    return slugify(raw.replace(new RegExp(`^${storyId}[:\\s-]*`, 'i'), '')) || slugify(storyId);
  } catch {
    return slugify(storyId);
  }
}

function worktreePath(cfg, storyId) {
  return path.join(ROOT, cfg.worktreesDir, storyId);
}

function metaPath(cfg, storyId) {
  return path.join(worktreePath(cfg, storyId), 'WORKTREE.json');
}

function nowIso() {
  return new Date().toISOString();
}

function activeWorktrees(cfg) {
  const base = path.join(ROOT, cfg.worktreesDir);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

// ── commands ─────────────────────────────────────────────────────────────────
/**
 * Register the worktree with serena and refresh its graphify index.
 * Both are best-effort: a missing context layer degrades symbol and graph lookups
 * to Read and Grep, which is a slower agent, not a broken one.
 */
function provisionContextLayers(dest) {
  try {
    const { register } = require('./serena/serena-project.cjs');
    const r = register(dest);
    if (r && r.ok && r.changed) info(`serena: registered ${path.basename(dest)}${r.name ? ` as ${r.name}` : ''}`);
    else if (r && !r.ok) info(`serena: skipped (${r.reason})`);
  } catch (err) {
    info(`serena: registration unavailable (${err.message})`);
  }

  // `graphify update` re-extracts code without an LLM, so it is cheap enough to
  // run on create. Without it a worktree inherits no graph, or a stale one.
  if (which('graphify') && fs.existsSync(path.join(ROOT, 'graphify-out', 'graph.json'))) {
    const g = require('child_process').spawnSync('graphify', ['update', dest], {
      cwd: dest, encoding: 'utf8', timeout: 120000,
    });
    if (g.status === 0) info('graphify: index refreshed for worktree');
    else info(`graphify: refresh skipped (${g.error ? g.error.message : `exit ${g.status}`})`);
  }
}

/** Release anything holding the worktree open before git deletes it. */
function releaseContextLayers(dest) {
  try {
    const { deregister } = require('./serena/serena-project.cjs');
    const r = deregister(dest);
    if (r && r.changed) info(`serena: deregistered ${path.basename(dest)}`);
  } catch (err) {
    info(`serena: deregistration skipped (${err.message})`);
  }

  // Stop any serena bridge whose cwd is inside this worktree; it holds a handle
  // on the directory and git worktree remove will fail while it lives.
  try {
    const pidFile = path.join(dest, '.serena', 'bridge.pid');
    if (fs.existsSync(pidFile)) {
      const pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (Number.isInteger(pid)) { try { process.kill(pid); info(`serena: stopped bridge pid ${pid}`); } catch {} }
      fs.rmSync(pidFile, { force: true });
    }
  } catch { /* best effort */ }
}

function cmdCreate(cfg, storyId, opts) {
  if (!storyId) fail('create requires a <story-id>');

  // 1. Validate the story exists.
  if (!fs.existsSync(storyFile(cfg, storyId))) {
    fail(`story not found: ${path.relative(ROOT, storyFile(cfg, storyId))}`);
  }

  const dest = worktreePath(cfg, storyId);
  const slug = deriveSlug(cfg, storyId, opts.slug);
  const branch = `${cfg.branchPrefix}/${storyId}-${slug}`;
  const defBranch = defaultBranch();
  const base = opts.base || `origin/${defBranch}`;

  // Idempotent: if the worktree already exists, just print its path.
  if (fs.existsSync(metaPath(cfg, storyId))) {
    info(`worktree already exists for ${storyId}`);
    return console.log(dest);
  }

  // 2. Concurrency limit.
  const existing = activeWorktrees(cfg);
  if (existing.length >= cfg.maxConcurrent) {
    fail(
      `BLOCKED: too many in-flight stories (${existing.length}/${cfg.maxConcurrent}). ` +
        `Active: ${existing.join(', ')}. Raise max_concurrent_worktrees in docs/config.yaml or finish a story first.`,
    );
  }

  // 3. Branch must not be checked out in another worktree (git enforces this too).
  const claimed = listGitWorktrees().find((w) => w.branch === branch);
  if (claimed) fail(`branch ${branch} is already checked out at ${claimed.path}`);

  // 4. Refresh the default branch, then add the worktree on a new branch.
  const fetch = git(['fetch', 'origin', defBranch]);
  if (fetch.code !== 0) info(`warning: 'git fetch origin ${defBranch}' failed (offline?), using local ${base}`);
  fs.mkdirSync(path.join(ROOT, cfg.worktreesDir), { recursive: true });

  let add = git(['worktree', 'add', dest, '-b', branch, base]);
  if (add.code !== 0) {
    // base ref may not exist locally (e.g. no remote) — fall back to local default branch / HEAD.
    info(`'${base}' unavailable, retrying from local ${defBranch}`);
    add = git(['worktree', 'add', dest, '-b', branch, defBranch]);
    if (add.code !== 0) gitOk(['worktree', 'add', dest, '-b', branch]);
  }

  // 4b. Context layers. A worktree is on a different branch, so it needs its own
  // serena project and its own graph. .serena/ is gitignored, so nothing arrives
  // with the checkout and the layers are silently dead until registered.
  provisionContextLayers(dest);

  // 5. Port + index for this worktree (so parallel dev servers don't collide).
  const index = existing.length;
  const port = cfg.portBase + index;

  // 6. Copy gitignored secrets that don't follow worktrees automatically.
  const srcEnv = path.join(ROOT, '.env.local');
  if (fs.existsSync(srcEnv)) {
    fs.copyFileSync(srcEnv, path.join(dest, '.env.local'));
    info('copied .env.local from primary');
  }
  // Append a per-worktree PORT so `npm run dev` instances don't fight over one port.
  try {
    fs.appendFileSync(path.join(dest, '.env.local'), `\n# kit worktree: unique dev port\nPORT=${port}\n`);
  } catch {}

  // 7. Bootstrap (npm install or project-configured command).
  if (cfg.bootstrap && cfg.bootstrap.toLowerCase() !== 'none') {
    info(`bootstrap: ${cfg.bootstrap}`);
    const boot = spawnSync(cfg.bootstrap, { cwd: dest, stdio: 'inherit', shell: true });
    if (boot.status !== 0) info('warning: bootstrap command exited non-zero — install deps manually in the worktree');
  }

  // 8. Submodules (worktree add does not init them).
  if (fs.existsSync(path.join(ROOT, '.gitmodules'))) {
    const sm = git(['submodule', 'update', '--init', '--recursive'], { cwd: dest });
    if (sm.code !== 0) info('warning: submodule init failed — run `git submodule update --init` in the worktree');
  }

  // 9. WORKTREE.json for the kit to inspect.
  const meta = { story_id: storyId, branch, base, index, port, created_at: nowIso(), agent: process.env.KIT_AGENT || 'implementer' };
  fs.writeFileSync(metaPath(cfg, storyId), JSON.stringify(meta, null, 2) + '\n');

  info(`created worktree ${path.relative(ROOT, dest)} on ${branch} (port ${port})`);
  // Last line = absolute path, for capture by callers.
  console.log(dest);
}

function cmdPath(cfg, storyId) {
  if (!storyId) fail('path requires a <story-id>');
  const dest = worktreePath(cfg, storyId);
  if (!fs.existsSync(metaPath(cfg, storyId))) fail(`no worktree for ${storyId}`);
  console.log(dest);
}

function cmdList(cfg, opts) {
  const rows = activeWorktrees(cfg).map((storyId) => {
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath(cfg, storyId), 'utf8')); } catch {}
    return {
      story_id: storyId,
      branch: meta.branch || '?',
      port: meta.port ?? null,
      created_at: meta.created_at || null,
      path: worktreePath(cfg, storyId),
    };
  });
  if (opts.json) return console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) return info('no active worktrees');
  info(`${rows.length}/${cfg.maxConcurrent} worktree slot(s) in use`);
  for (const r of rows) {
    console.log(`  ${r.story_id.padEnd(14)} ${String(r.branch).padEnd(40)} port ${r.port ?? '-'}`);
  }
}

/** Best-effort merged check that tolerates squash merges (the kit's merge mode). */
function isMerged(branch, defBranch) {
  // After `gh pr merge --squash --delete-branch` the remote branch is gone and the
  // PR shows MERGED, but `git branch --merged <default>` won't list a squashed branch.
  if (which('gh')) {
    const r = spawnSync('gh', ['pr', 'view', branch, '--json', 'state', '-q', '.state'], { cwd: ROOT, encoding: 'utf8', shell: false });
    if (r.status === 0 && /MERGED/i.test(r.stdout)) return true;
  }
  // Fall back to ancestor containment (true-merge case).
  const merged = git(['branch', '--merged', defBranch, '--format=%(refname:short)']).out.split(/\r?\n/);
  return merged.includes(branch);
}

function cmdRemove(cfg, storyId, opts) {
  if (!storyId) fail('remove requires a <story-id>');
  const dest = worktreePath(cfg, storyId);
  if (!fs.existsSync(dest)) fail(`no worktree directory for ${storyId}`);
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaPath(cfg, storyId), 'utf8')); } catch {}
  const branch = meta.branch;

  // 1. Safety: refuse unless the branch is merged (or --force). This is the real guard —
  // it protects unmerged *commits*, not the expected untracked cruft (.env.local,
  // node_modules) we ourselves put in the worktree.
  const defBranch = defaultBranch();
  const merged = branch ? isMerged(branch, defBranch) : true;
  if (!opts.force && !merged) {
    fail(`branch ${branch} is not merged into ${defBranch}. Re-run with --force to discard unmerged work.`);
  }

  // 2. Promote any unmerged diary buffer into the primary before destroying it.
  const buffer = path.join(dest, '.cursor', 'branch-diary-buffer.md');
  if (fs.existsSync(buffer)) {
    const content = fs.readFileSync(buffer, 'utf8').trim();
    if (content) {
      const promotedDir = path.join(ROOT, 'docs', 'diary', 'promoted');
      fs.mkdirSync(promotedDir, { recursive: true });
      const target = path.join(promotedDir, `${storyId}-diary.md`);
      fs.appendFileSync(target, `\n## Promoted from worktree ${storyId} @ ${nowIso()}\n\n${content}\n`);
      info(`promoted diary buffer → ${path.relative(ROOT, target)}`);
    }
  }

  // 3. Remove the worktree. Past the merge guard, --force is safe and necessary:
  // the worktree legitimately holds untracked node_modules / .env.local.
  // A running serena daemon holds an open handle on the worktree directory, so
  // `git worktree remove` fails with EPERM until it is released. Observed, not
  // theoretical: it blocked a removal during ADR-0003 work.
  releaseContextLayers(dest);

  const rm = git(['worktree', 'remove', dest, '--force']);
  if (rm.code !== 0) fail(`git worktree remove failed: ${rm.err || rm.out}`);

  // 4. Delete the local branch if it is fully merged.
  if (branch && merged) {
    const del = git(['branch', '-D', branch]);
    if (del.code === 0) info(`deleted local branch ${branch}`);
  }

  info(`removed worktree for ${storyId}`);
}

function cmdPrune(cfg) {
  gitOk(['worktree', 'prune']);
  // Drop orphaned dirs whose git worktree registration is gone.
  const registered = new Set(listGitWorktrees().map((w) => path.resolve(w.path)));
  for (const storyId of activeWorktrees(cfg)) {
    const dest = path.resolve(worktreePath(cfg, storyId));
    if (!registered.has(dest)) {
      info(`pruning stale dir ${path.relative(ROOT, dest)}`);
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
  info('prune complete');
}

// ── arg parsing / entry ──────────────────────────────────────────────────────
function info(msg) { process.stderr.write(`[worktree] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[worktree] ERROR: ${msg}\n`); process.exit(1); }

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--slug') flags.slug = argv[++i];
    else if (a === '--base') flags.base = argv[++i];
    else positional.push(a);
  }
  return { flags, positional };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);
  const cfg = readConfig();
  switch (cmd) {
    case 'create': return cmdCreate(cfg, positional[0], flags);
    case 'path': return cmdPath(cfg, positional[0]);
    case 'list': return cmdList(cfg, flags);
    case 'remove': return cmdRemove(cfg, positional[0], flags);
    case 'prune': return cmdPrune(cfg);
    default:
      console.log(`worktree.cjs — git worktree manager for the Autonomous SWE Kit

Usage:
  node scripts/worktree.cjs create <story-id> [--slug <slug>] [--base <ref>]
  node scripts/worktree.cjs path   <story-id>
  node scripts/worktree.cjs list   [--json]
  node scripts/worktree.cjs remove <story-id> [--force]
  node scripts/worktree.cjs prune

Config (docs/config.yaml):
  max_concurrent_worktrees  (default 1)   parallel story limit
  worktree_bootstrap        (default "npm install")  per-worktree setup, "none" to skip
  worktree_port_base        (default 3000)  PORT = base + worktree index
  worktrees_dir             (default .worktrees)
`);
      process.exit(cmd ? 1 : 0);
  }
}

try {
  main();
} catch (e) {
  fail(e.message || String(e));
}
