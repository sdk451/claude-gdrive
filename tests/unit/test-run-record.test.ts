import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function runSummaryScript(cwd: string, env: Record<string, string>): void {
  execFileSync(process.execPath, ["scripts/ci/write-test-result-summary.mjs"], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

describe("write-test-result-summary.mjs (test-run-record.json)", () => {
  it("writes a v1 record with tiered tests and links", () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const dir = mkdtempSync(join(tmpdir(), "gdrive-summary-"));

    // Minimal vitest JSON shape the script reads.
    const reportsDir = join(dir, "reports");
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(
      join(reportsDir, "vitest-unit.json"),
      JSON.stringify(
        {
          numPassedTests: 1,
          numFailedTests: 0,
          numPendingTests: 0,
          numTotalTests: 1,
          testResults: [
            {
              name: join(repoRoot, "tests", "unit", "server.test.ts"),
              assertionResults: [{ title: "returns 200 on /healthz", status: "passed" }],
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    // Create a story targets file so targeted tier can be derived.
    const docsTestsDir = join(dir, "docs", "tests");
    mkdirSync(docsTestsDir, { recursive: true });
    writeFileSync(
      join(docsTestsDir, "TOK-123-targets.txt"),
      ["# targets", "unit: tests/unit/server.test.ts"].join("\n") + "\n",
      "utf8",
    );

    // Add a targeted log that indicates green.
    writeFileSync(
      join(reportsDir, "targeted-tests.log"),
      "[run-targeted-tests] ALL GREEN across tiers\n",
      "utf8",
    );

    // Copy scripts into temp run (we just run from repoRoot, but output into temp).
    // Easiest: run node with cwd=dir, but scripts path is relative. So create a shim:
    mkdirSync(join(dir, "scripts", "ci"), { recursive: true });
    writeFileSync(
      join(dir, "scripts", "ci", "write-test-result-summary.mjs"),
      readFileSync(join(repoRoot, "scripts", "ci", "write-test-result-summary.mjs"), "utf8"),
      "utf8",
    );

    runSummaryScript(dir, {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: "org/repo",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_SHA: "0123456789abcdef",
      HEAD_REF: "TOK-123/some-branch",
      PR_NUMBER: "3",
      PR_URL: "https://github.com/org/repo/pull/3",
      GITHUB_RUN_ID: "999",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_WORKFLOW: "pr-validation",
      GITHUB_JOB: "validate",
    });

    const rec = JSON.parse(readFileSync(join(reportsDir, "test-run-record.json"), "utf8"));
    expect(rec.schema).toBe("gdrive.testRunRecord.v1");
    expect(rec.storyId).toBe("TOK-123");
    expect(rec.links.pullRequest).toBe("https://github.com/org/repo/pull/3");
    expect(rec.links.actionsRun).toBe("https://github.com/org/repo/actions/runs/999");
    expect(rec.links.actionsJob).toBe("validate");
    expect(rec.tiers.unit.length).toBeGreaterThan(0);
    expect(rec.tiers.targeted.length).toBeGreaterThan(0);
    expect(rec.tiers.targeted[0].status).toBe("passed");
  });
});
