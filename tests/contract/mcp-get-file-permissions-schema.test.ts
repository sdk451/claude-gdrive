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
      clientInfo: { name: "vitest-permissions-schema", version: "0.0.0" },
    },
  };
}

describe("TOK-27 get_file_permissions inputSchema (contract)", () => {
  it("tools/list exposes get_file_permissions with required fileId and optional pagination", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-27-schema")),
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
    const tool = body.result?.tools?.find((t) => t.name === "get_file_permissions");
    expect(tool).toBeDefined();
    const schema = tool?.inputSchema;
    expect(schema?.type).toBe("object");
    const props = schema?.properties as Record<string, unknown> | undefined;
    expect(props?.fileId).toBeDefined();
    expect(props?.pageSize).toBeDefined();
    expect(props?.pageToken).toBeDefined();
    expect((schema?.required as string[]).includes("fileId")).toBe(true);
    expect((schema?.required as string[]).includes("pageSize")).toBe(false);
    expect((schema?.required as string[]).includes("pageToken")).toBe(false);
  });
});
