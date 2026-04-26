import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type {
  DriveFilesPort,
  ListFilePermissionsParams,
} from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-get-permissions", version: "0.0.0" },
    },
  };
}

describe("TOK-27 get_file_permissions integration (stubbed Drive)", () => {
  it("tools/call get_file_permissions without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-27-no-token")),
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
        id: 50,
        method: "tools/call",
        params: { name: "get_file_permissions", arguments: { fileId: "f-1" } },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/not connected|OAuth|Complete OAuth/i);
  });

  it("tools/call get_file_permissions forwards fileId and pageSize to stub", async () => {
    const calls: ListFilePermissionsParams[] = [];
    const stub: DriveFilesPort = {
      async listFiles() {
        return { files: [] };
      },
      async readFileContent() {
        throw new Error("readFileContent not used in this test");
      },
      async downloadFileContent() {
        throw new Error("downloadFileContent not used in this test");
      },
      async getFileMetadata() {
        throw new Error("getFileMetadata not used in this test");
      },
      async listFilePermissions(params) {
        calls.push(params);
        return {
          permissions: [
            { id: "p1", type: "user", role: "writer", displayName: "Bob" },
            { id: "p2", type: "anyone", role: "reader" },
          ],
          nextPageToken: "tok-next",
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
      body: JSON.stringify(initializeBody("tok-27-int")),
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
        id: 51,
        method: "tools/call",
        params: {
          name: "get_file_permissions",
          arguments: { fileId: "doc-xyz", pageSize: 25 },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      permissions: Array<{ id: string; type: string; role: string }>;
      nextPageToken?: string;
    };
    expect(parsed.permissions).toHaveLength(2);
    expect(parsed.permissions[0]?.role).toBe("writer");
    expect(parsed.nextPageToken).toBe("tok-next");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fileId).toBe("doc-xyz");
    expect(calls[0]?.pageSize).toBe(25);
  });
});
