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
    expect(yml).toContain("fetch-linear-issue.mjs");
    expect(yml).toContain("append-test-run-log.mjs");
    expect(yml).toMatch(/actions\/upload-artifact@v\d+/);
    expect(yml).toContain("reports/test-run-record.json");
    expect(yml).toContain("reports/linear-issue.json");
    expect(yml).toContain("docs/test-runs/test-runs.jsonl");
  });
});

describe("ci workflow (main + container)", () => {
  const workflowPath = join(repoRoot, ".github/workflows/ci.yml");
  const yml = readFileSync(workflowPath, "utf8");

  it("runs on push to main with regression story targets + artifact", () => {
    expect(yml).toContain("branches: [main]");
    expect(yml).toContain("push:");
    expect(yml).toContain("run-regression-story-targets.sh");
    expect(yml).toContain("write-test-result-summary.mjs");
    expect(yml).toContain("append-test-run-log.mjs");
    expect(yml).toContain("MAIN_REGRESSION_SUMMARY.md");
    expect(yml).toContain("reports/test-run-record.json");
    expect(yml).toContain("docs/test-runs/test-runs.jsonl");
  });

  it("builds container after regression and supports WIF push", () => {
    expect(yml).toMatch(/^\s*container:/m);
    expect(yml).toContain("needs: regression");
    expect(yml).toMatch(/docker\/setup-buildx-action@v\d+/);
    expect(yml).toContain("docker build");
    expect(yml).toMatch(/google-github-actions\/auth@v\d+/);
    expect(yml).toContain("GCP_WORKLOAD_IDENTITY_PROVIDER");
    expect(yml).toContain("GCP_ARTIFACT_REGISTRY");
  });

  it("supports optional staging deploy + smoke on main", () => {
    expect(yml).toMatch(/^\s*deploy_staging:/m);
    expect(yml).toContain("deploy to Cloud Run");
    expect(yml).toContain("Smoke test staging URL");
    expect(yml).toContain("/healthz");
    expect(yml).toContain("/.well-known/oauth-authorization-server");
  });
});
