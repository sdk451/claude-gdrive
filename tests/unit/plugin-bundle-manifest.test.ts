import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

describe("TOK-37 plugin bundle (P-01 plugin.json, P-02 .mcp.json)", () => {
  it("exposes .claude-plugin/plugin.json with required metadata fields", () => {
    const raw = readFileSync(path.join(ROOT, ".claude-plugin", "plugin.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["id", "name", "description", "version", "author"]) {
      expect(typeof parsed[key]).toBe("string");
      expect((parsed[key] as string).length).toBeGreaterThan(0);
    }
    expect(parsed.id).toBe("app.tokenomik.gdrive-cowork-connector");
  });

  it("exposes .mcp.json with http gdrive server pointing at /mcp", () => {
    const raw = readFileSync(path.join(ROOT, ".mcp.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, { type?: string; url?: string }>;
    };
    expect(parsed.mcpServers).toBeDefined();
    const keys = Object.keys(parsed.mcpServers ?? {});
    expect(keys).toEqual(["gdrive"]);
    const g = parsed.mcpServers?.gdrive;
    expect(g?.type).toBe("http");
    expect(typeof g?.url).toBe("string");
    expect(g?.url?.endsWith("/mcp")).toBe(true);
    expect(() => new URL(g!.url!)).not.toThrow();
  });
});
