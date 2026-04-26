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
      clientInfo: { name: "vitest-update-file-schema", version: "0.0.0" },
    },
  };
}

describe("TOK-30 update_file inputSchema (contract)", () => {
  it("tools/list exposes update_file with fileId, destructiveHint, and optional fields", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-schema")),
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
      result?: {
        tools?: Array<{
          name?: string;
          inputSchema?: Record<string, unknown>;
          annotations?: { destructiveHint?: boolean };
        }>;
      };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    const tool = body.result?.tools?.find((t) => t.name === "update_file");
    expect(tool).toBeDefined();
    expect(tool?.annotations?.destructiveHint).toBe(true);
    const schema = tool?.inputSchema;
    expect(schema?.type).toBe("object");
    const props = schema?.properties as Record<string, unknown> | undefined;
    expect(props?.fileId).toBeDefined();
    expect(props?.name).toBeDefined();
    expect(props?.mimeType).toBeDefined();
    expect(props?.mediaBase64).toBeDefined();
    expect(props?.mediaMimeType).toBeDefined();
    const req = schema?.required as string[];
    expect(req.includes("fileId")).toBe(true);
    expect(req.includes("name")).toBe(false);
    expect(req.includes("mimeType")).toBe(false);
    expect(req.includes("mediaBase64")).toBe(false);
    expect(req.includes("mediaMimeType")).toBe(false);
  });
});
