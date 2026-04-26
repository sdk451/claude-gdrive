import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createFetchDriveFilesPort } from "../../src/drive/fetch-drive-files.js";
import { GDRIVE_MCP_TOOL_NAMES } from "../../src/mcp/gdrive-mcp-server.js";
import {
  getToolsListEmptyTotal,
  resetToolsListEmptyTotalForTests,
} from "../../src/observability/tools-list-empty.js";
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
      clientInfo: { name: "vitest-tools-list-regression", version: "0.0.0" },
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
    body: JSON.stringify(initializeBody("tok-40-init")),
  });
  expect(initRes.status).toBe(200);
  const sessionId = initRes.headers.get("mcp-session-id");
  expect(sessionId).toBeTruthy();
  const initJson = (await initRes.json()) as { result?: { protocolVersion?: string } };
  const negotiated = initJson.result!.protocolVersion!;
  return { sessionId: sessionId!, negotiated };
}

function assertNotSuccessfulEmptyToolList(body: unknown) {
  if (!body || typeof body !== "object") return;
  const b = body as { error?: unknown; result?: { tools?: unknown[] } };
  if (b.error !== undefined) return;
  if (b.result !== undefined && Array.isArray(b.result.tools)) {
    expect(b.result.tools.length).toBeGreaterThan(0);
  }
}

describe("S5.1 tools.list regression (TOK-40)", () => {
  it("tools.list.returns_full_set_after_oauth", async () => {
    resetToolsListEmptyTotalForTests();
    const driveFiles = createFetchDriveFilesPort(() => "synthetic-oauth-access-token");
    const app = createApp({ driveFiles });
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
    const names = new Set((body.result?.tools ?? []).map((t) => t.name));
    for (const name of GDRIVE_MCP_TOOL_NAMES) {
      expect(names.has(name)).toBe(true);
    }
    expect(getToolsListEmptyTotal()).toBe(0);
  });

  it("tools.list.never_empty_post_init", async () => {
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
        id: 10,
        method: "tools/list",
        params: {},
      }),
    });
    expect(listRes.status).toBe(200);
    const firstBody = await listRes.json();
    assertNotSuccessfulEmptyToolList(firstBody);

    const delRes = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(delRes.status).toBe(200);

    const staleList = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
        "mcp-session-id": sessionId,
        "mcp-protocol-version": negotiated,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/list",
        params: {},
      }),
    });
    expect(staleList.status).toBe(404);
    const staleBody = await staleList.json();
    expect((staleBody as { error?: unknown }).error).toBeDefined();
    assertNotSuccessfulEmptyToolList(staleBody);
  });
});
