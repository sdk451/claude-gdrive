import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("Dockerfile (TOK-8)", () => {
  const dockerfile = readFileSync(join(repoRoot, "Dockerfile"), "utf8");

  it("uses node 22 bookworm-slim base", () => {
    expect(dockerfile).toMatch(/FROM node:22-bookworm-slim/i);
  });

  it("runs the compiled ESM entry as non-root", () => {
    expect(dockerfile).toMatch(/USER\s+appuser/i);
    expect(dockerfile).toContain("dist/index.js");
  });

  it("builds TypeScript with pnpm", () => {
    expect(dockerfile).toContain("pnpm run build");
    expect(dockerfile).toContain("pnpm prune --prod");
  });
});
