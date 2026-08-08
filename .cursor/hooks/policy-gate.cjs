'use strict';

// PreToolUse + PermissionRequest permission gate. See docs/adr/0002.
//
// Wired in exec form ("command": "node", "args": [<this file>]) so no shell is
// involved: bare `bash` on a Windows host with WSL resolves to the WSL bash,
// which cannot resolve Windows-style script paths.
//
// FAIL-OPEN CONTRACT: exit code 2 blocks a tool call, so any internal error in
// this file must print nothing and exit 0. A bug in the permission gate must
// degrade to "no opinion", never to "blocked".

const fs = require('node:fs');
const path = require('node:path');

const started = Date.now();

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findProjectRoot(cwd) {
  let d = path.resolve(cwd || process.cwd());
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

function audit(root, record) {
  if (!root) return;
  try {
    const dir = path.join(root, '.cursor', 'hooks', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'permissions.jsonl'), JSON.stringify(record) + '\n');
  } catch {
    // Auditing must never affect the decision.
  }
}

function emitPreToolUse(result) {
  if (result.decision === 'silence') return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: result.decision,
      permissionDecisionReason: '[' + result.rule + '] ' + result.reason,
    },
  }));
}

function emitPermissionRequest(result) {
  if (result.decision === 'silence') return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: result.decision },
    },
  }));
}
function main() {
  const raw = readStdin();
  let event;
  try { event = JSON.parse(raw); } catch { return; }   // unparseable input -> no opinion

  const root = findProjectRoot(event.cwd);
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'permissions-policy.json'), 'utf8'));
  } catch {
    // No policy, or a malformed one, means the gate is not configured here.
    // Say nothing and let the normal permission flow apply.
    return;
  }

  const { evaluate } = require('./lib/policy-engine.cjs');
  const result = evaluate(event, policy, root);

  audit(root, {
    ts: new Date().toISOString(),
    event: event.hook_event_name,
    session: event.session_id,
    mode: event.permission_mode,
    tool: event.tool_name,
    decision: result.decision,
    rule: result.rule,
    reason: result.reason,
    durationMs: Date.now() - started,
  });

  if (event.hook_event_name === 'PermissionRequest') emitPermissionRequest(result);
  else emitPreToolUse(result);
}

try {
  main();
} catch (err) {
  // Deliberately swallowed. See the fail-open contract above. Stderr on exit 0
  // reaches the debug log only, so it is safe to leave a trace for diagnosis.
  try { process.stderr.write('policy-gate: internal error: ' + (err && err.message) + '\n'); } catch {}
}
process.exit(0);