#!/usr/bin/env node
'use strict';
/**
 * workflow.cjs — read the workflow definition (D-38).
 *
 *   node scripts/workflow.cjs steps story-loop            # the ordered step list
 *   node scripts/workflow.cjs steps story-loop --ci active
 *   node scripts/workflow.cjs validate story-loop         # structural check
 *
 * The orchestrator asks for its steps rather than carrying them in prose, so a
 * customer override changes the sequence without anyone editing an agent file.
 */
const WF = require('./lib/workflow.cjs');
const A = require('./lib/adapters.cjs');

function main() {
  const [cmd, id, ...rest] = process.argv.slice(2);
  if (!cmd || !id) {
    console.log('usage: node scripts/workflow.cjs <steps|validate> <workflow-id> [--ci active|deferred] [--json]');
    process.exit(2);
  }
  const ci = rest.includes('--ci') ? rest[rest.indexOf('--ci') + 1] : 'deferred';
  const asJson = rest.includes('--json');

  let wf;
  try {
    wf = WF.load(id, process.cwd());
  } catch (err) {
    console.error(`[workflow] ${err.message}`);
    process.exit(1);
  }

  if (cmd === 'validate') {
    const agentsDir = WF.resolveAgentsDir(process.cwd());
    const problems = WF.validate(wf, A.VERBS, { root: process.cwd(), agentsDir });
    const unused = WF.unused(wf);
    problems.forEach((p) => console.error(`FAIL ${p}`));
    unused.forEach((u) => console.log(`note  step defined but unused: ${u}`));
    if (!problems.length) console.log(`OK   ${id}: ${(wf.phases || []).length} phases, ${Object.keys(wf.steps || {}).length} steps`);
    process.exit(problems.length ? 1 : 0);
  }

  if (cmd === 'steps') {
    const list = WF.steps(wf, { github_ci_phase: ci });
    if (asJson) { console.log(JSON.stringify(list, null, 2)); return; }
    console.log(`${wf.title || id}  (github_ci_phase=${ci})`);
    let n = 0;
    let phase = null;
    for (const s of list) {
      if (s.phase !== phase) { phase = s.phase; console.log(`\n  ${phase.toUpperCase()}${s.repeats ? '  (repeats)' : ''}`); }
      n += 1;
      const how = s.intent ? `intent ${s.intent}` : s.run ? `run ${s.run}` : s.agent ? `agent ${s.agent}` : '';
      console.log(`   ${String(n).padStart(2)}. ${s.does}${how ? `\n       → ${how}` : ''}`);
    }
    return;
  }
  console.error(`[workflow] unknown command: ${cmd}`);
  process.exit(2);
}

if (require.main === module) main();