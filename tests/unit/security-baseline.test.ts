import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("security baseline", () => {
  it("adds security workflow with PR + weekly schedule", () => {
    const workflowPath = join(repoRoot, ".github/workflows/security.yml");
    expect(existsSync(workflowPath)).toBe(true);
    const yml = readFileSync(workflowPath, "utf8");

    expect(yml).toMatch(/^\s*on:\s*$/m);
    expect(yml).toMatch(/pull_request(_target)?:/);
    expect(yml).toMatch(/schedule:/);
    expect(yml).toMatch(/cron:/);
  });

  it("runs pnpm audit gating high/critical, plus gitleaks and trivy", () => {
    const workflowPath = join(repoRoot, ".github/workflows/security.yml");
    const yml = readFileSync(workflowPath, "utf8");

    expect(yml).toMatch(/pnpm\s+audit/);
    expect(yml).toMatch(/audit-level\s*=?\s*high/);
    expect(yml).toMatch(/gitleaks\/gitleaks-action|gitleaks:v/i);
    expect(yml).toContain("aquasecurity/trivy-action");
  });

  it("enables dependabot for npm and github-actions", () => {
    const dependabotPath = join(repoRoot, ".github/dependabot.yml");
    expect(existsSync(dependabotPath)).toBe(true);
    const yml = readFileSync(dependabotPath, "utf8");

    expect(yml).toMatch(/package-ecosystem:\s*["']?npm["']?/);
    expect(yml).toMatch(/package-ecosystem:\s*["']?github-actions["']?/);
    expect(yml).toMatch(/schedule:/);
    expect(yml).toMatch(/interval:\s*["']?weekly["']?/);
  });
});
