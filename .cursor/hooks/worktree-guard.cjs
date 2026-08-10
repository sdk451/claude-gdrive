'use strict';

// Stop hook: refuse to end a session leaving work only on this machine.
//
// The cleanup that prompted this recovered ~10GB of stranded worktrees, all on
// merged branches. The stranding is survivable; unpushed commits are not, because
// `worktree remove` deletes the directory and the commits go with it.
//
// Exec form, Node, no shell. Fail-open: any internal error exits 0.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function main() {
  let event;
  try { event = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }

  // stop_hook_active guards the loop: without it, blocking here would re-enter
  // this hook on the continuation and never terminate.
  if (event.stop_hook_active) return;

  const cwd = event.cwd || process.cwd();
  let root, branch;
  try {
    root = git(['rev-parse', '--show-toplevel'], cwd);
    branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  } catch { return; }
  if (!branch || branch === 'HEAD') return;          // detached, nothing to push

  let ahead = null;
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
    ahead = Number.parseInt(git(['rev-list', '--count', `${upstream}..HEAD`], cwd), 10);
  } catch {
    ahead = -1;                                       // no upstream at all
  }

  // --untracked-files=no on purpose: a worktree legitimately holds node_modules,
  // .env.local and editor directories. Blocking on those would train the operator to
  // ignore this hook, which is the failure mode it exists to prevent.
  const dirty = (() => {
    try { return git(['status', '--porcelain', '--untracked-files=no'], cwd).split('\n').filter(Boolean).length; } catch { return 0; }
  })();

  const problems = [];
  if (ahead === -1) problems.push(`branch ${branch} has no upstream, so nothing is pushed`);
  else if (ahead > 0) problems.push(`${ahead} commit(s) on ${branch} are not pushed`);
  if (dirty > 0) problems.push(`${dirty} uncommitted change(s)`);
  if (!problems.length) return;

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: [
      'Work in ' + path.basename(root) + ' exists only on this machine: ' + problems.join('; ') + '.',
      'Commit and push before finishing, or say explicitly that this is intentional.',
      'A worktree removal would discard it.',
    ].join(' '),
  }));
}

try { main(); } catch { /* fail open */ }
process.exit(0);