import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("release workflow (S0.9)", () => {
  it("runs on SemVer tags and gates prod promote + smoke", () => {
    const workflowPath = join(repoRoot, ".github/workflows/release.yml");
    expect(existsSync(workflowPath)).toBe(true);
    const yml = readFileSync(workflowPath, "utf8");

    expect(yml).toMatch(/^\s*on:\s*$/m);
    expect(yml).toMatch(/tags:/);
    expect(yml).toContain("v*.*.*");
    expect(yml).toContain("google-github-actions/auth@v3");
    expect(yml).toContain("docker pull");
    expect(yml).toContain("RepoDigests");
    expect(yml).toContain("gcloud run deploy");
    expect(yml).toContain("/healthz");
    expect(yml).toContain("/.well-known/oauth-authorization-server");
    expect(yml).toContain("/__smoke/mcp-tools-list");
    expect(yml).toMatch(/CLOUD_RUN_SERVICE_PROD|gdrive-mcp/);
  });

  it("documents single-command prod rollback in README", () => {
    const readmePath = join(repoRoot, "README.md");
    const md = readFileSync(readmePath, "utf8");
    expect(md).toContain("gcloud run services update-traffic");
    expect(md).toContain("--to-revisions=");
    expect(md).toContain("=100");
  });
});
