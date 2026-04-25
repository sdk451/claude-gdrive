import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("pr-validation workflow", () => {
  const workflowPath = join(repoRoot, ".github/workflows/pr-validation.yml");
  const yml = readFileSync(workflowPath, "utf8");

  it("declares concurrency with cancel-in-progress", () => {
    expect(yml).toMatch(/concurrency:/);
    expect(yml).toMatch(/cancel-in-progress:\s*true/);
  });

  it("runs markdown lint, Vitest CI reports, dynamic targeted tests, summary + artifact", () => {
    expect(yml).toMatch(/pnpm\s+run\s+lint:md|pnpm\s+lint:md/);
    expect(yml).toContain("test:unit:ci");
    expect(yml).toContain("run-targeted-tests.sh");
    expect(yml).toMatch(/Resolve story id|story_id/);
    expect(yml).toContain("write-test-result-summary.mjs");
    expect(yml).toContain("actions/upload-artifact@v4");
  });
});

describe("ci-main workflow", () => {
  const workflowPath = join(repoRoot, ".github/workflows/ci-main.yml");
  const yml = readFileSync(workflowPath, "utf8");

  it("runs on push to main with regression story targets + artifact", () => {
    expect(yml).toContain("branches: [main]");
    expect(yml).toContain("push:");
    expect(yml).toContain("run-regression-story-targets.sh");
    expect(yml).toContain("write-test-result-summary.mjs");
    expect(yml).toContain("MAIN_REGRESSION_SUMMARY.md");
  });
});
