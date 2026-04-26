import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";

describe("smoke tools/list stub", () => {
  it("GET /__smoke/mcp-tools-list returns MCP-shaped JSON", async () => {
    const app = createApp();
    const res = await app.request("http://localhost/__smoke/mcp-tools-list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jsonrpc?: string;
      result?: { tools?: Array<{ name?: string }> };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result?.tools?.length).toBeGreaterThan(0);
    expect(body.result?.tools?.[0]?.name).toBeDefined();
  });
});
