'use strict';

// Pure decision function over a Claude Code tool call. No I/O, no process exit,
// no logging. Everything that touches the outside world lives in policy-gate.cjs
// so this file can be tested without spawning a session.
//
// Returns one of:
//   { decision: 'allow',   rule, reason }
//   { decision: 'deny',    rule, reason }
//   { decision: 'silence', rule, reason }   <- no opinion; normal permission flow
//
// Silence is never an approval. Under `default` mode it becomes a prompt; under
// `dontAsk` it becomes a denial. See ADR-0002.

const path = require('node:path');

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'TodoWrite', 'Task', 'WebSearch']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function silence(rule, reason) { return { decision: 'silence', rule, reason }; }
function allow(rule, reason) { return { decision: 'allow', rule, reason }; }
function deny(rule, reason) { return { decision: 'deny', rule, reason }; }

// Minimal glob matcher: supports ** and *. Paths are compared with forward
// slashes and lowercased, because Windows paths arrive in both shapes.
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else out += '[^/]*';
    } else if ('\\^$+?.()|[]{}'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp('^' + out + '$', 'i');
}

function norm(p) { return String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''); }

function matchesAny(filePath, globs) {
  const n = norm(filePath);
  return (globs || []).some((g) => globToRegExp(norm(g)).test(n));
}

// A path is contained if it resolves inside root. Uses path.relative rather than
// prefix comparison so `..` traversal and `C:\repos\foo-evil` vs `C:\repos\foo`
// are both handled.
function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
// Split a shell command into its constituent subcommands. Handles &&, ||, ;, |
// and command substitution. Returns null when the command cannot be parsed
// confidently, which the caller must treat as "no opinion" rather than "safe".
/**
 * Remove heredoc bodies, leaving the command that opened them.
 *
 * `cat > f << 'EOF'` followed by arbitrary text and a terminator is one command
 * plus data. Splitting the data on newlines would turn prose into subcommands
 * and make the gate prompt on every multi-line commit message.
 */
function stripHeredocs(src) {
  const open = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g;
  let out = src;
  let m;
  while ((m = open.exec(src)) !== null) {
    const tag = m[2];
    // The body runs from the end of the opening line to a line that is exactly
    // the terminator. `<<-` permits leading tabs on the terminator.
    const after = out.indexOf('\n', out.indexOf(m[0]));
    if (after === -1) continue;
    const term = new RegExp('^[\\t ]*' + tag + '[\\t ]*$', 'm');
    const rest = out.slice(after + 1);
    const hit = term.exec(rest);
    if (!hit) {
      // Unterminated heredoc: drop everything after it rather than guess.
      out = out.slice(0, after);
      break;
    }
    out = out.slice(0, after + 1) + rest.slice(hit.index + hit[0].length);
  }
  return out;
}

function splitSubcommands(command) {
  const src = String(command || '');
  if (!src.trim()) return null;
  // Unbalanced quotes mean we cannot trust our own tokenisation.
  const dq = (src.match(/"/g) || []).length;
  const sq = (src.match(/'/g) || []).length;
  if (dq % 2 !== 0 || sq % 2 !== 0) return null;

  // Pull out $(...) and `...` bodies and treat them as subcommands in their own
  // right, so `echo $(rm -rf /)` is judged on the rm, not the echo.
  const nested = [];
  let flat = src;
  const subst = /\$\(([^()]*)\)|`([^`]*)`/g;
  let m;
  while ((m = subst.exec(src)) !== null) nested.push(m[1] || m[2] || '');
  flat = flat.replace(subst, ' ');

  // Heredoc bodies are DATA, not commands. Strip them before splitting on
  // newlines, or a commit message reading "rm the old file" becomes a subcommand
  // and the gate starts prompting on prose. `cat > f << 'EOF' ... EOF` keeps its
  // head; the body disappears.
  flat = stripHeredocs(flat);

  // Newlines separate commands exactly as `;` does. Omitting them meant a
  // newline HID everything after it: `git status\nrm -rf ~` parsed as ONE
  // subcommand with head `git`, was found on the allowed list, and the rm was
  // passed through unexamined. The gate then reported "all 1 subcommand(s) on
  // the allowed head list" - precise, confident, and wrong about the count.
  const parts = flat
    .split(/&&|\|\||[;|\n\r]/)
    .concat(nested)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length ? parts : null;
}

// The head is the first bare token, after stripping leading VAR=value
// assignments, matching how the platform evaluates Bash permission rules.
function headOf(subcommand) {
  const toks = String(subcommand).trim().split(/\s+/);
  let i = 0;
  while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
  if (i >= toks.length) return null;
  return toks[i].replace(/^["']|["']$/g, '');
}

function evaluateShell(command, policy) {
  const shell = policy.shell || {};
  const src = String(command || '');

  // Denied patterns are checked against the whole command first, so an
  // obfuscation that defeats subcommand splitting still gets caught here.
  for (const pat of shell.deniedPatterns || []) {
    let re;
    try { re = new RegExp(pat); } catch { continue; }
    if (re.test(src)) {
      const guidance = (shell.denyGuidance || {})[pat];
      return deny('shell.denied', guidance || ('matches denied pattern: ' + pat));
    }
  }

  const parts = splitSubcommands(src);
  if (!parts) return silence('shell.unparsed', 'command could not be parsed confidently');

  const heads = new Set(shell.allowedHeads || []);
  const unknown = [];
  for (const part of parts) {
    const h = headOf(part);
    if (!h) return silence('shell.nohead', 'subcommand has no resolvable head');
    if (!heads.has(h)) unknown.push(h);
  }
  if (unknown.length) {
    return silence('shell.unknownhead', 'not on the allowed head list: ' + unknown.join(', '));
  }
  return allow('shell.allowed', 'all ' + parts.length + ' subcommand(s) on the allowed head list');
}
function evaluateWrite(toolInput, policy, projectRoot) {
  const w = policy.write || {};
  const target = toolInput && (toolInput.file_path || toolInput.path || toolInput.notebook_path);
  if (!target) return silence('write.notarget', 'no file path in tool input');

  // Self-modification is checked before containment: these files are inside the
  // project root by definition, so containment alone would allow them.
  if (matchesAny(target, w.selfModificationGlobs)) {
    return deny('write.selfmod',
      'writing to the permission configuration or hook scripts would let the session widen its own permissions');
  }
  if (matchesAny(target, w.protectedGlobs)) {
    return deny('write.protected', 'path matches a protected glob');
  }
  if (w.containToProjectRoot) {
    if (!projectRoot) return silence('write.noroot', 'project root unknown, cannot verify containment');
    if (!isInside(projectRoot, target)) {
      return deny('write.escape', 'path resolves outside the project root');
    }
  }
  return allow('write.contained', 'inside project root and not protected');
}

function evaluateMcp(toolName, policy) {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(toolName);
  const server = m ? m[1] : null;
  if (!server) return silence('mcp.unparsed', 'could not extract server from tool name');
  const allowed = (policy.mcpServers && policy.mcpServers.allow) || [];
  if (allowed.includes(server)) return allow('mcp.allowed', 'server "' + server + '" is allowlisted');
  return silence('mcp.unlisted', 'server "' + server + '" is not allowlisted');
}

/**
 * @param {object} event   the hook JSON, as delivered on stdin
 * @param {object} policy  parsed permissions-policy.json
 * @param {string} projectRoot  absolute path to the project root
 */
function evaluate(event, policy, projectRoot) {
  const tool = (event && event.tool_name) || '';
  const input = (event && event.tool_input) || {};

  if (!tool) return silence('no.tool', 'no tool_name in event');

  if (tool.startsWith('mcp__')) return evaluateMcp(tool, policy);
  if (SHELL_TOOLS.has(tool)) return evaluateShell(input.command, policy);
  if (WRITE_TOOLS.has(tool)) return evaluateWrite(input, policy, projectRoot);

  // Read-only tools are handled by static allow entries in settings.json and
  // should not reach the gate at all. If one does, say nothing rather than
  // duplicating a rule that already lives in the permission system.
  if (READ_ONLY_TOOLS.has(tool)) return silence('readonly.static', 'covered by static allow rules');

  return silence('unhandled.tool', 'no rule for tool ' + tool);
}

module.exports = {
  stripHeredocs,
  evaluate, evaluateShell, evaluateWrite, evaluateMcp,
  splitSubcommands, headOf, isInside, matchesAny, globToRegExp,
  READ_ONLY_TOOLS, WRITE_TOOLS, SHELL_TOOLS,
};