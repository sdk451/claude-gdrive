import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { DriveFilesPort, ListFilesParams } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-drive-search", version: "0.0.0" },
    },
  };
}

describe("TOK-23 search_files integration (stubbed Drive)", () => {
  it("tools/call search_files without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-23-no-token")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id")!;
    const negotiated = ((await initRes.json()) as { result: { protocolVersion: string } }).result
      .protocolVersion;

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
        id: 11,
        method: "tools/call",
        params: { name: "search_files", arguments: { q: "name = 'x'" } },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/not connected|OAuth/i);
  });

  it("tools/call search_files forwards q to Drive port and returns stubbed files", async () => {
    const calls: ListFilesParams[] = [];
    const stub: DriveFilesPort = {
      async listFiles(params) {
        calls.push(params);
        return {
          files: [
            {
              id: "file-1",
              name: "Quarterly",
              mimeType: "application/vnd.google-apps.spreadsheet",
            },
          ],
          nextPageToken: "next-abc",
        };
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-23-int")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id")!;
    const negotiated = ((await initRes.json()) as { result: { protocolVersion: string } }).result
      .protocolVersion;

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
        id: 10,
        method: "tools/call",
        params: {
          name: "search_files",
          arguments: {
            q: "mimeType='application/vnd.google-apps.spreadsheet'",
            pageSize: 10,
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
      error?: unknown;
    };
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).not.toBe(true);
    const text = body.result?.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text!) as {
      files: Array<{ id: string; name: string }>;
      nextPageToken?: string;
    };
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.id).toBe("file-1");
    expect(parsed.nextPageToken).toBe("next-abc");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.q).toBe("mimeType='application/vnd.google-apps.spreadsheet'");
    expect(calls[0]?.pageSize).toBe(10);
  });
});
