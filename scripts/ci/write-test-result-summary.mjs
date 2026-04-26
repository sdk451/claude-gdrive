#!/usr/bin/env node
/**
 * Writes a human-readable Markdown summary of Vitest JSON (+ optional targeted log)
 * for association with a PR / branch / Linear story in CI.
 *
 * Additionally writes a machine-readable run record:
 *   reports/test-run-record.json
 * which can be appended to docs/test-runs/test-runs.jsonl by
 * scripts/ci/append-test-run-log.mjs.
 *
 * Env (set by GitHub Actions):
 *   GITHUB_EVENT_NAME     pull_request | push | ...
 *   GITHUB_REPOSITORY     owner/repo
 *   GITHUB_SHA            (push)
 *   GITHUB_REF_NAME       branch name
 *   GITHUB_SERVER_URL     https://github.com
 *   PR_NUMBER, PR_URL, HEAD_REF — optional; set by workflow for pull_request
 *   GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_WORKFLOW, GITHUB_JOB — for Actions links
 *
 * Reads:
 *   reports/vitest-unit.json
 *   reports/targeted-tests.log (optional)
 *
 * Writes:
 *   pull_request → reports/STORY_TEST_SUMMARY.md
 *   push (main)  → reports/MAIN_REGRESSION_SUMMARY.md
 *   all events  → reports/test-run-record.json
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
const runId = process.env.GITHUB_RUN_ID ?? "";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "";
const workflow = process.env.GITHUB_WORKFLOW ?? "";
const job = process.env.GITHUB_JOB ?? "";

const storyMatch = headRef.match(/([A-Z]+-\d+)/);
const storyId = storyMatch ? storyMatch[1] : "unknown";
const linearIssueUrl =
  storyId === "unknown" ? "" : `https://linear.app/tokenomik/issue/${storyId}`;
const targetsFile =
  storyId === "unknown" ? "" : `docs/tests/${storyId}-targets.txt`;
const designDoc = storyId === "unknown" ? "" : `docs/designs/${storyId}.md`;
const actionsRunUrl =
  runId && server && repo ? `${server}/${repo}/actions/runs/${runId}` : "";

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
if (actionsRunUrl) {
  lines.push(`| **GitHub Actions** | [run](${actionsRunUrl})${job ? ` (job: \`${job}\`)` : ""} |`);
}
if (linearIssueUrl) {
  lines.push(`| **Linear issue** | [${storyId}](${linearIssueUrl}) |`);
}
lines.push(`| **Vitest JSON** | \`reports/vitest-unit.json\` (machine-readable) |`);
lines.push(`| **Vitest JUnit** | \`reports/vitest-unit-junit.xml\` (CI tools) |`);
lines.push(``);

const tiered = buildTieredTests({ vitest, storyId });
const acceptanceCriteria = resolveAcceptanceCriteria({ storyId, designDoc, linearIssueUrl });
const record = buildTestRunRecord({
  event,
  storyId,
  repo,
  headRef,
  sha,
  prNumber,
  prUrl,
  server,
  runId,
  runAttempt,
  workflow,
  job,
  linearIssueUrl,
  designDoc,
  targetsFile,
  acceptanceCriteria,
  tiers: tiered,
});

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

const recordPath = join(reportsDir, "test-run-record.json");
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");
console.log(`Wrote ${recordPath}`);

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

function buildTieredTests({ vitest, storyId }) {
  const empty = {
    unit: [],
    targeted: [],
    api: [],
    component: [],
    e2e: [],
    visual: [],
    "ux-flow": [],
    custom: [],
  };

  // Unit tier from vitest-unit.json
  if (vitest && !vitest.parseError) {
    for (const file of vitest.testResults ?? []) {
      const rel = normalizeTestFile(file.name);
      for (const a of file.assertionResults ?? []) {
        empty.unit.push({
          id: `${rel}::${String(a.title ?? "?")}`,
          description: String(a.title ?? ""),
          type: "unit",
          status: String(a.status ?? "unknown"),
        });
      }
    }
  }

  // Targeted tier from docs/tests/<story>-targets.txt
  if (storyId && storyId !== "unknown") {
    const p = join(process.cwd(), "docs", "tests", `${storyId}-targets.txt`);
    if (existsSync(p)) {
      const body = readFileSync(p, "utf8");
      const lines = body.split(/\r?\n/);
      for (const line of lines) {
        const raw = line.trim();
        if (!raw || raw.startsWith("#")) continue;
        const tier = raw.includes(":") ? raw.split(":")[0] : "custom";
        const spec = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1).trim() : raw;
        const normalizedTier =
          tier === "unit" ||
          tier === "api" ||
          tier === "component" ||
          tier === "e2e" ||
          tier === "visual" ||
          tier === "ux-flow"
            ? tier
            : "custom";
        empty.targeted.push({
          id: `target:${normalizedTier}:${spec}`,
          description: spec,
          type: normalizedTier,
          status: "unknown",
        });
      }
    }
  }

  // Best-effort: if targeted runner log exists and says ALL GREEN, mark targeted passed.
  const targetedLogPath = join(process.cwd(), "reports", "targeted-tests.log");
  if (existsSync(targetedLogPath)) {
    const t = readFileSync(targetedLogPath, "utf8");
    if (/\[run-targeted-tests\]\s+ALL GREEN/.test(t)) {
      for (const item of empty.targeted) {
        item.status = "passed";
      }
    }
  }

  return empty;
}

function buildTestRunRecord({
  event,
  storyId,
  repo,
  headRef,
  sha,
  prUrl,
  server,
  runId,
  runAttempt,
  workflow,
  job,
  linearIssueUrl,
  designDoc,
  targetsFile,
  acceptanceCriteria,
  tiers,
}) {
  const actionsRun =
    runId && server && repo ? `${server}/${repo}/actions/runs/${runId}` : "";

  return {
    schema: "gdrive.testRunRecord.v1",
    timestamp: new Date().toISOString(),
    event,
    storyId,
    links: {
      linearIssue: linearIssueUrl,
      designDoc,
      targetsFile,
      pullRequest: prUrl,
      actionsRun,
      actionsJob: job,
      actionsMeta: {
        runId,
        runAttempt,
        workflow,
      },
    },
    acceptanceCriteria,
    git: {
      repository: repo,
      ref: headRef,
      sha,
    },
    tiers,
  };
}

function resolveAcceptanceCriteria({ storyId, designDoc, linearIssueUrl }) {
  // Prefer Linear description fragments when explicitly provided (CI cannot call Linear).
  // Supported inputs:
  // - env.LINEAR_ISSUE_DESCRIPTION (raw markdown/plaintext)
  // - reports/linear-issue.json { url, description }
  const fromLinear = tryParseLinearAcceptanceCriteria({ storyId, linearIssueUrl });
  if (fromLinear.items.length > 0) return fromLinear;

  // Fallback: extract AC bullets from docs/backlog.md via story code (e.g. S0.4),
  // inferred from docs/designs/<storyId>.md frontmatter `title: S0.4 — ...`.
  const storyCode = inferStoryCodeFromDesign(designDoc);
  const fromBacklog = storyCode ? tryParseBacklogAcceptanceCriteria(storyCode) : null;
  if (fromBacklog && fromBacklog.items.length > 0) return fromBacklog;

  return {
    source: "none",
    storyCode,
    url: "",
    items: [],
  };
}

function tryParseLinearAcceptanceCriteria({ storyId, linearIssueUrl }) {
  const candidates = [];
  if (process.env.LINEAR_ISSUE_DESCRIPTION) {
    candidates.push({
      url: process.env.LINEAR_ISSUE_URL || linearIssueUrl || "",
      description: process.env.LINEAR_ISSUE_DESCRIPTION,
      source: "env",
    });
  }

  const p = join(process.cwd(), "reports", "linear-issue.json");
  if (existsSync(p)) {
    try {
      const obj = JSON.parse(readFileSync(p, "utf8"));
      candidates.push({
        url: String(obj?.url ?? linearIssueUrl ?? ""),
        description: String(obj?.description ?? ""),
        source: "reports/linear-issue.json",
      });
    } catch {
      // ignore
    }
  }

  for (const c of candidates) {
    const items = extractAcLines(c.description);
    if (items.length > 0) {
      return {
        source: "linear",
        storyCode: "",
        url: c.url,
        storyId,
        items: items.map((text, idx) => ({
          id: `AC${idx + 1}`,
          text,
          fragment: makeFragment(text),
        })),
      };
    }
  }

  return { source: "linear", storyCode: "", url: linearIssueUrl || "", storyId, items: [] };
}

function inferStoryCodeFromDesign(designDocPath) {
  try {
    if (!designDocPath) return "";
    const abs = join(process.cwd(), designDocPath);
    if (!existsSync(abs)) return "";
    const body = readFileSync(abs, "utf8");
    const m = body.match(/^\s*title:\s*(S\d+\.\d+)\b/m);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

function tryParseBacklogAcceptanceCriteria(storyCode) {
  const backlogPath = join(process.cwd(), "docs", "backlog.md");
  if (!existsSync(backlogPath)) return null;
  const body = readFileSync(backlogPath, "utf8");
  const lines = body.split(/\r?\n/);

  let inSection = false;
  let heading = "";
  const items = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (inSection) break;
      if (line.includes(`${storyCode} `) || line.includes(`${storyCode} —`)) {
        inSection = true;
        heading = line.trim();
      }
      continue;
    }
    if (!inSection) continue;
    const t = line.trim();
    const acMatch = t.match(/^-\s*(AC\d+):\s*(.+)$/);
    if (acMatch) {
      items.push({ id: acMatch[1], text: acMatch[2], fragment: makeFragment(acMatch[2]) });
    }
  }

  return {
    source: "backlog",
    storyCode,
    url: "docs/backlog.md",
    heading,
    items,
  };
}

function extractAcLines(description) {
  const out = [];
  const lines = String(description || "").split(/\r?\n/);
  let inAc = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^##\s+Acceptance\s+criteria/i.test(t) || /^##\s+Acceptance\s+Criteria/i.test(t)) {
      inAc = true;
      continue;
    }
    if (inAc && /^##\s+/.test(t)) break;
    if (!inAc) continue;
    const m = t.match(/^[-*]\s+(.+)$/);
    if (m) out.push(m[1]);
  }
  return out;
}

function makeFragment(text) {
  // Best-effort stable fragment for matching.
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}
