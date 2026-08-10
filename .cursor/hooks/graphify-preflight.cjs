'use strict';

// PreToolUse on Grep|Glob: point the agent at the knowledge graph before it does
// a broad text search. Replaces graphify-preflight-search.sh.
//
// The shell version was wrong in two ways, and only survived because it never ran.
//
// 1. WIRE FORMAT. It emitted `{agent_message: ...}`, the Cursor flat-hook shape.
//    Claude Code reads hookSpecificOutput.additionalContext. It has never
//    delivered a message to an agent.
//
// 2. THE ADVICE. It told the agent to read graphify-out/GRAPH_REPORT.md first.
//    Measured on this workstation:
//
//      tmk-intelligence     GRAPH_REPORT.md  2195 KB  ~607,000 tokens
//      graphene-consumer                      402 KB  ~111,000 tokens
//      graphene                               300 KB   ~83,000 tokens
//
//    A hook meant to protect the context window was advising the agent to fill
//    it several times over. `graphify query` with an explicit --budget is the
//    context-efficient interface and is what this recommends instead.
//
// Exec form, Node, no jq. Fail-open: any error exits 0 silently.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BUDGET = 2000;

function projectRoot(cwd) {
  let d = path.resolve(cwd || process.cwd());
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

// The reminder is worth injecting once. Repeating it on every Grep and Glob in a
// session is itself the context bloat this hook exists to reduce.
function alreadyToldThisSession(sessionId) {
  if (!sessionId) return false;
  const marker = path.join(os.tmpdir(), 'graphify-preflight-' + String(sessionId).replace(/[^\w-]/g, '') + '.flag');
  try {
    if (fs.existsSync(marker)) return true;
    fs.writeFileSync(marker, '1');
    return false;
  } catch {
    return false;
  }
}

function main() {
  let event;
  try { event = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }

  const root = projectRoot(event.cwd);
  if (!root) return;

  const graph = path.join(root, 'graphify-out', 'graph.json');
  if (!fs.existsSync(graph)) return;                    // no graph, nothing to say
  if (alreadyToldThisSession(event.session_id)) return;

  const context = [
    'A graphify knowledge graph exists for this repo (graphify-out/graph.json).',
    'For structural questions prefer it over broad Grep/Glob:',
    '  graphify query "<question>" --budget ' + BUDGET,
    '  graphify path "A" "B"',
    '  graphify explain "<node>"',
    'Do NOT read graphify-out/GRAPH_REPORT.md directly; it can exceed 500k tokens.',
    'For symbol-level lookups prefer serena (find_symbol, get_symbols_overview).',
  ].join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context },
  }));
}

try { main(); } catch { /* fail open */ }
process.exit(0);