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
      clientInfo: { name: "vitest-tool-registry", version: "0.0.0" },
    },
  };
}

async function openMcpSession(app: ReturnType<typeof createApp>) {
  const initRes = await app.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: MCP_POST_ACCEPT,
    },
    body: JSON.stringify(initializeBody("tok-19")),
  });
  expect(initRes.status).toBe(200);
  const sessionId = initRes.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  const initJson = (await initRes.json()) as { result?: { protocolVersion?: string } };
  const negotiated = initJson.result!.protocolVersion!;
  return { sessionId: sessionId!, negotiated };
}

describe("MCP tool registry (TOK-19 / S1.2, Epic 2 tools)", () => {
  it("tools/list returns Epic 2 Drive tools including get_file_permissions (F-03)", async () => {
    const app = createApp();
    const { sessionId, negotiated } = await openMcpSession(app);

    const listRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": sessionId,
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
      result?: { tools?: Array<{ name?: string }> };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.result?.tools)).toBe(true);
    const names = (body.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("search_files");
    expect(names).toContain("read_file_content");
    expect(names).toContain("download_file_content");
    expect(names).toContain("get_file_metadata");
    expect(names).toContain("get_file_permissions");
  });

  it("tools/call for unknown tool returns text-first structured error (isError)", async () => {
    const app = createApp();
    const { sessionId, negotiated } = await openMcpSession(app);

    const callRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": sessionId,
        "mcp-protocol-version": negotiated,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "no.such.tool", arguments: {} },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: {
        isError?: boolean;
        content?: Array<{ type?: string; text?: string }>;
      };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.type).toBe("text");
    expect(typeof body.result?.content?.[0]?.text).toBe("string");
    const first = body.result?.content?.[0];
    expect(first?.text?.length ?? 0).toBeGreaterThan(0);
  });
});
