import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { GDRIVE_MCP_TOOL_NAMES } from "../../src/mcp/gdrive-mcp-server.js";
import { createApp } from "../../src/server.js";

const MCP_POST_ACCEPT = "application/json, text/event-stream";

/** State-changing tools that must advertise `destructiveHint: true` (S5.3 / constitution). */
const DESTRUCTIVE_TOOL_NAMES = ["create_file", "update_file", "move_file", "share_file"] as const;

function initializeBody(id: number | string) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "vitest-destructive-hints", version: "0.0.0" },
    },
  };
}

describe("S5.3 destructiveHint regression (TOK-42)", () => {
  it("tools/list marks all destructive tools with destructiveHint and never marks read tools", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-42-hints")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id")!;
    const negotiated = ((await initRes.json()) as { result: { protocolVersion: string } }).result
      .protocolVersion;

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
      result?: {
        tools?: Array<{
          name?: string;
          annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean };
        }>;
      };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    const byName = new Map((body.result?.tools ?? []).map((t) => [t.name as string, t] as const));

    for (const name of GDRIVE_MCP_TOOL_NAMES) {
      const tool = byName.get(name);
      expect(tool, `missing tool ${name}`).toBeDefined();
    }

    for (const name of DESTRUCTIVE_TOOL_NAMES) {
      expect(byName.get(name)?.annotations?.destructiveHint).toBe(true);
    }

    for (const name of GDRIVE_MCP_TOOL_NAMES) {
      if ((DESTRUCTIVE_TOOL_NAMES as readonly string[]).includes(name)) continue;
      expect(byName.get(name)?.annotations?.destructiveHint).not.toBe(true);
    }

    expect(byName.get("list_folder")?.annotations?.readOnlyHint).toBe(true);
  });
});
