import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const step10 = join(
  repoRoot,
  "docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding/steps/step-10-readiness.md",
);

describe("step-10 implementation readiness (TOK-15)", () => {
  it("has eight checked inline criteria with evidence paths or URLs", () => {
    const raw = readFileSync(step10, "utf8");
    const start = raw.indexOf("**Inline criteria**");
    const end = raw.indexOf("**Record the gate result**");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = raw.slice(start, end);
    const lines = slice.split("\n").filter((l) => /^\s*-\s*\[x\]/.test(l));
    expect(lines).toHaveLength(8);
    for (const line of lines) {
      expect(line).toMatch(/`|https?:\/\//);
    }
  });

  it("registers verify-completion-promise on stop", () => {
    const hooks = readFileSync(join(repoRoot, ".cursor/hooks.json"), "utf8");
    expect(hooks).toContain("verify-completion-promise.sh");
  });
});
