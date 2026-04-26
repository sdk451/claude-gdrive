import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const RUNBOOK_FILES = [
  "tools-list-empty.md",
  "oauth-refresh-failure.md",
  "cloud-run-5xx.md",
  "latency-p95-high.md",
  "dependency-high-severity-cve.md",
  "secret-in-log.md",
] as const;

describe("TOK-43 / S5.4 runbooks and MCP Inspector script", () => {
  it("publishes a runbook file for every alert in docs/observability.md", () => {
    for (const name of RUNBOOK_FILES) {
      const p = path.join(ROOT, "docs", "runbooks", name);
      expect(existsSync(p), `missing ${name}`).toBe(true);
    }
  });

  it("documents runbook index and inspector script in README", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("](docs/runbooks/README.md)");
    expect(readme).toContain("](scripts/mcp-inspector-validate.sh)");
    expect(readme).toContain("pnpm inspector:validate");
  });

  it("ships mcp-inspector-validate.sh with CLI tools/list invocation", () => {
    const sh = readFileSync(path.join(ROOT, "scripts", "mcp-inspector-validate.sh"), "utf8");
    expect(sh).toContain("@modelcontextprotocol/inspector");
    expect(sh).toContain("--cli");
    expect(sh).toContain("--transport http");
    expect(sh).toContain("--method tools/list");
    expect(sh).toContain("MCP_INSPECTOR_URL");
  });
});
