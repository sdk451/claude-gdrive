import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createApp } from "../../src/server.js";

const MCP_POST_ACCEPT = "application/json, text/event-stream";

function initializeBody(id: number | string) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "vitest-search-schema", version: "0.0.0" },
    },
  };
}

describe("TOK-23 search_files inputSchema (contract)", () => {
  it("tools/list exposes search_files with required q in inputSchema", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-23-schema")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const initJson = (await initRes.json()) as { result?: { protocolVersion?: string } };
    const negotiated = initJson.result!.protocolVersion!;

    const listRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": sessionId!,
        "mcp-protocol-version": negotiated,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as {
      result?: { tools?: Array<{ name?: string; inputSchema?: Record<string, unknown> }> };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    const tools = body.result?.tools ?? [];
    const search = tools.find((t) => t.name === "search_files");
    expect(search).toBeDefined();
    const schema = search?.inputSchema;
    expect(schema).toBeDefined();
    expect(schema?.type).toBe("object");
    const props = schema?.properties as Record<string, unknown> | undefined;
    expect(props?.q).toBeDefined();
    expect(Array.isArray(schema?.required)).toBe(true);
    expect((schema?.required as string[]).includes("q")).toBe(true);
  });
});
