#!/usr/bin/env node
/**
 * Writes a human-readable Markdown summary of Vitest JSON (+ optional targeted log)
 * for association with a PR / branch / Linear story in CI.
 *
 * Env (set by GitHub Actions):
 *   GITHUB_EVENT_NAME     pull_request | push | ...
 *   GITHUB_REPOSITORY     owner/repo
 *   GITHUB_SHA            (push)
 *   GITHUB_REF_NAME       branch name
 *   GITHUB_SERVER_URL     https://github.com
 *   PR_NUMBER, PR_URL, HEAD_REF — optional; set by workflow for pull_request
 *
 * Reads:
 *   reports/vitest-unit.json
 *   reports/targeted-tests.log (optional)
 *
 * Writes:
 *   pull_request → reports/STORY_TEST_SUMMARY.md
 *   push (main)  → reports/MAIN_REGRESSION_SUMMARY.md
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const reportsDir = join(process.cwd(), "reports");
mkdirSync(reportsDir, { recursive: true });

const event = process.env.GITHUB_EVENT_NAME ?? "local";
const repo = process.env.GITHUB_REPOSITORY ?? "local/checkout";
const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const sha = process.env.GITHUB_SHA ?? "local";
const ref = process.env.GITHUB_REF_NAME ?? process.env.HEAD_REF ?? "unknown";
const prNumber = process.env.PR_NUMBER ?? "";
const prUrl = process.env.PR_URL ?? "";
const headRef = process.env.HEAD_REF ?? ref;

const storyMatch = headRef.match(/([A-Z]+-\d+)/);
const storyId = storyMatch ? storyMatch[1] : "unknown";

const vitestPath = join(reportsDir, "vitest-unit.json");
const targetedLog = join(reportsDir, "targeted-tests.log");
const regressionStoryLog = join(reportsDir, "regression-story-targets.log");

let vitest = null;
if (existsSync(vitestPath)) {
  try {
    vitest = JSON.parse(readFileSync(vitestPath, "utf8"));
  } catch {
    vitest = { parseError: true };
  }
}

let targetedBody = "";
if (existsSync(targetedLog)) {
  targetedBody = readFileSync(targetedLog, "utf8");
}

let regressionStoryBody = "";
if (existsSync(regressionStoryLog)) {
  regressionStoryBody = readFileSync(regressionStoryLog, "utf8");
}

const lines = [];
lines.push(`# Test run summary`);
lines.push(``);
lines.push(`| Field | Value |`);
lines.push(`| --- | --- |`);
lines.push(`| **Event** | \`${event}\` |`);
lines.push(`| **Repository** | \`${repo}\` |`);
lines.push(`| **Git ref** | \`${headRef}\` |`);
lines.push(`| **Resolved Linear / story id** | \`${storyId}\` |`);
if (prNumber) {
  lines.push(`| **Pull request** | [#${prNumber}](${prUrl}) |`);
}
if (event === "push") {
  lines.push(`| **Commit** | [\`${sha.slice(0, 7)}\`](${server}/${repo}/commit/${sha}) |`);
}
lines.push(`| **Vitest JSON** | \`reports/vitest-unit.json\` (machine-readable) |`);
lines.push(`| **Vitest JUnit** | \`reports/vitest-unit-junit.xml\` (CI tools) |`);
lines.push(``);

if (!vitest || vitest.parseError) {
  lines.push(`## Unit + default Vitest suite`);
  lines.push(``);
  lines.push(
    vitest?.parseError
      ? `_Could not parse vitest-unit.json._`
      : `_No vitest-unit.json found — tests may have failed before the reporter ran._`,
  );
  lines.push(``);
} else {
  lines.push(`## Unit + default Vitest suite`);
  lines.push(``);
  lines.push(
    `**Totals:** ${vitest.numPassedTests ?? 0} passed, ${vitest.numFailedTests ?? 0} failed, ${vitest.numPendingTests ?? 0} pending / ${vitest.numTotalTests ?? 0} total tests.`,
  );
  lines.push(``);
  lines.push(`| Status | File | Test |`);
  lines.push(`| --- | --- | --- |`);
  for (const file of vitest.testResults ?? []) {
    const rel = normalizeTestFile(file.name);
    for (const a of file.assertionResults ?? []) {
      const st = a.status === "passed" ? "pass" : a.status === "failed" ? "**FAIL**" : a.status;
      lines.push(`| ${st} | \`${rel}\` | ${escapeCell(a.title)} |`);
    }
  }
  lines.push(``);
}

lines.push(`## Targeted story suite (this PR branch)`);
lines.push(``);
if (!targetedBody.trim()) {
  lines.push(
    `_No \`reports/targeted-tests.log\` — either no \`docs/tests/${storyId}-targets.txt\` for this branch, or the targeted step was skipped._`,
  );
} else {
  lines.push(`Raw runner output (also in artifact as \`targeted-tests.log\`):`);
  lines.push(``);
  lines.push("```text");
  lines.push(targetedBody.trimEnd());
  lines.push("```");
  lines.push(``);
}

if (regressionStoryBody.trim()) {
  lines.push(`## Aggregated story targets (main regression only)`);
  lines.push(``);
  lines.push(
    `Output from \`scripts/ci/run-regression-story-targets.sh\` (\`reports/regression-story-targets.log\`):`,
  );
  lines.push(``);
  lines.push("```text");
  lines.push(regressionStoryBody.trimEnd());
  lines.push("```");
  lines.push(``);
}

lines.push(`## Where this lives`);
lines.push(``);
lines.push(
  `- **GitHub:** Actions run → your workflow job → **Artifacts** (zip). Download and open \`STORY_TEST_SUMMARY.md\` or \`MAIN_REGRESSION_SUMMARY.md\`.`,
);
lines.push(
  `- **Linear:** Link the artifact or PR URL in a comment when closing a story (the workflow does not call Linear).`,
);
lines.push(`- **Docs:** See \`docs/test-strategy.md\` and \`docs/testing-artifacts-and-regression.md\`.`);
lines.push(``);

const outName =
  event === "pull_request" ? "STORY_TEST_SUMMARY.md" : "MAIN_REGRESSION_SUMMARY.md";
const outPath = join(reportsDir, outName);
writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${outPath}`);

function normalizeTestFile(abs) {
  if (!abs) return "?";
  const s = String(abs).replace(/\\/g, "/");
  const idx = s.lastIndexOf("/tests/");
  if (idx >= 0) return s.slice(idx + 1);
  const parts = s.split("/");
  return parts.slice(-2).join("/");
}

function escapeCell(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
