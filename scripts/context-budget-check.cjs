#!/usr/bin/env node
/**
 * Context budget reminder. Reads targets from docs/config.yaml -> context_budget.
 *
 * THIS SCRIPT CALLED A COMMAND THAT DOES NOT EXIST. It ran
 * `context-mode ctx stats`, and context-mode has no `ctx` command - v1.0.169
 * offers index, search, doctor, upgrade, hook and statusline. An unknown
 * subcommand exits 0 and prints NOTHING:
 *
 *     > context-mode definitely-not-a-command
 *     (no output)   rc=0
 *
 * So the budget section printed its targets, printed nothing where the numbers
 * should have been, printed its advice, and exited 0. It had been reporting
 * nothing since the CLI changed underneath it, and looked like it was working.
 *
 * The presence check was the same shape: `context-mode --version` is not a flag
 * either. It happened to work only because execSync throws when the binary is
 * missing entirely - the check passed for the right answer by accident.
 *
 * Every context-mode call now goes through run(), which treats EMPTY OUTPUT AS
 * FAILURE. A CLI that answers silently cannot be trusted to a zero exit code.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const configPath = path.join(root, 'docs', 'config.yaml');

let target = 60000;
let warn = 50000;
let storyReset = true;

if (fs.existsSync(configPath)) {
  const text = fs.readFileSync(configPath, 'utf8');
  const t = text.match(/target_input_tokens:\s*(\d+)/);
  const w = text.match(/warn_threshold_tokens:\s*(\d+)/);
  const s = text.match(/story_boundary_reset:\s*(true|false)/);
  if (t) target = parseInt(t[1], 10);
  if (w) warn = parseInt(w[1], 10);
  if (s) storyReset = s[1] === 'true';
}

console.log(`Context budget: target ${target} input tokens (warn ${warn})`);
console.log(`Story boundary reset: ${storyReset ? 'enabled' : 'disabled'}`);
console.log('Guide: docs/context-management.md\n');

/**
 * Run a context-mode subcommand and insist it said something.
 *
 * Returns the output, or null with a named reason. Empty output is a failure
 * even at exit 0, because that is precisely what an unknown subcommand looks
 * like - and it is how this script came to report nothing for weeks.
 */
function run(args) {
  const r = spawnSync('context-mode', args, {
    encoding: 'utf8',
    cwd: root,
    shell: process.platform === 'win32',
  });
  if (r.error) return { ok: false, reason: 'not installed' };
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (!out) return { ok: false, reason: `\`context-mode ${args.join(' ')}\` produced no output` };
  return { ok: true, out };
}

// --help is a real flag that prints a usage block, so a silent answer here means
// the binary is present but not behaving - worth saying out loud rather than
// treating as healthy.
const probe = run(['--help']);
if (!probe.ok) {
  if (probe.reason === 'not installed') {
    console.log('context-mode not installed — run kit installer or: npm install -g context-mode');
  } else {
    console.log(`context-mode is installed but did not respond: ${probe.reason}`);
    console.log('Run `context-mode doctor` — the CLI contract may have changed under this script.');
  }
  process.exit(0);
}

// context-mode exposes no live token count. `doctor` is the supported runtime
// diagnostic; anything narrower would be guessing at a command again.
console.log('Runtime diagnosis: `context-mode doctor`');
console.log('Indexed search:    `context-mode search <query>`\n');

console.log(`\nIf the session feels sluggish above ~${warn} tokens, /clear between stories or /compact mid-story.`);
console.log('Between stories: fresh subagents + load only the next requirements file.');

process.exit(0);
