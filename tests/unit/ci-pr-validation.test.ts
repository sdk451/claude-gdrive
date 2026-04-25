import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("pr-validation workflow (TOK-7)", () => {
  const workflowPath = join(repoRoot, ".github/workflows/pr-validation.yml");
  const yml = readFileSync(workflowPath, "utf8");

  it("declares concurrency with cancel-in-progress", () => {
    expect(yml).toMatch(/concurrency:/);
    expect(yml).toMatch(/cancel-in-progress:\s*true/);
  });

  it("runs markdown lint and targeted tests for TOK-7", () => {
    expect(yml).toMatch(/pnpm\s+run\s+lint:md|pnpm\s+lint:md/);
    expect(yml).toContain("run-targeted-tests.sh");
    expect(yml).toContain("docs/tests/TOK-7-targets.txt");
  });
});
