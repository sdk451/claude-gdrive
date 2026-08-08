"use strict";
/**
 * Emit one compact agent-audit line for the buffered session (per agent stop).
 * Must run last under stop hooks.
 */
const audit = require("./audit-lib.cjs");

try {
  const out = audit.flushCompactSummary();
  if (process.env.AGENT_AUDIT_DEBUG === "1") {
    process.stderr.write(
      `[audit-flush] ${out.wrote ? "wrote" : "skipped"} ${JSON.stringify(out)}\n`,
    );
  }
} catch (e) {
  if (process.env.AGENT_AUDIT_DEBUG === "1") {
    process.stderr.write(`[audit-flush] error: ${e}\n`);
  }
}
process.exit(0);
