import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");

describe("TOK-39 operator README (P-07)", () => {
  it("includes operator guide with Cloud Run, OAuth, environments deep link, and plugin MCP URL hints", () => {
    expect(readme).toContain("## Operator guide");
    expect(readme).toMatch(/Cloud Run/i);
    expect(readme).toMatch(/Secret Manager/i);
    expect(readme).toContain("](docs/environments.md");
    expect(readme).toContain("https://claude.ai/api/mcp/auth_callback");
    expect(readme).toContain("GOOGLE_CLIENT_ID");
    expect(readme).toContain(".mcp.json");
    expect(readme).toContain("/mcp");
  });
});
