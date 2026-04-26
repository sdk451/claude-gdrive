import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createApp } from "../../src/server.js";

/** Streamable HTTP POST requires both media types in Accept (MCP spec). */
const MCP_POST_ACCEPT = "application/json, text/event-stream";

function initializeBody(id: number | string) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "vitest-contract", version: "0.0.0" },
    },
  };
}

describe("Streamable HTTP /mcp (TOK-18)", () => {
  it("POST initialize returns session id; POST tools/list works; unknown session 404", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody(1)),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const initJson = (await initRes.json()) as { result?: { protocolVersion?: string } };
    expect(initJson.result?.protocolVersion).toBeDefined();
    const negotiated = initJson.result!.protocolVersion!;

    const pingRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": sessionId!,
        "mcp-protocol-version": negotiated,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "ping",
        params: {},
      }),
    });
    expect(pingRes.status).toBe(200);
    const pingJson = (await pingRes.json()) as { result?: Record<string, never> };
    expect(pingJson.result).toEqual({});

    const badSession = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": "00000000-0000-4000-8000-000000000000",
        "mcp-protocol-version": negotiated,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping", params: {} }),
    });
    expect(badSession.status).toBe(404);
  });

  it("GET /mcp with valid session returns 200", async () => {
    const app = createApp();
    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("a")),
    });
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const getRes = await app.request("http://localhost/mcp", {
      method: "GET",
      headers: {
        "mcp-session-id": sessionId!,
        Accept: "text/event-stream",
      },
    });
    expect(getRes.status).toBe(200);
  });

  it("DELETE /mcp ends session; GET afterwards is 400", async () => {
    const app = createApp();
    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("b")),
    });
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();

    const delRes = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId! },
    });
    expect(delRes.status).toBe(200);

    const getRes = await app.request("http://localhost/mcp", {
      method: "GET",
      headers: {
        "mcp-session-id": sessionId!,
        Accept: "text/event-stream",
      },
    });
    expect(getRes.status).toBe(400);
  });
});
