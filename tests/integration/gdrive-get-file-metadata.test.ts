import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { DriveFilesPort, GetFileMetadataParams } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-get-metadata", version: "0.0.0" },
    },
  };
}

describe("TOK-26 get_file_metadata integration (stubbed Drive)", () => {
  it("tools/call get_file_metadata without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-26-no-token")),
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
        id: 40,
        method: "tools/call",
        params: { name: "get_file_metadata", arguments: { fileId: "meta-1" } },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/not connected|OAuth|Complete OAuth/i);
  });

  it("tools/call get_file_metadata forwards fileId to stub", async () => {
    const calls: GetFileMetadataParams[] = [];
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
      async getFileMetadata(params) {
        calls.push(params);
        return {
          id: "meta-1",
          name: "Report.pdf",
          mimeType: "application/pdf",
          size: "1024",
          modifiedTime: "2024-01-01T00:00:00.000Z",
          shared: true,
          owners: [{ displayName: "Ada Lovelace", permissionId: "owner" }],
        };
      },
      async listFilePermissions() {
        throw new Error("listFilePermissions not used in this test");
      },
      async createFile() {
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile not used in this test");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-26-int")),
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
        id: 41,
        method: "tools/call",
        params: { name: "get_file_metadata", arguments: { fileId: "meta-1" } },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      id: string;
      name: string;
      mimeType?: string;
      shared?: boolean;
      owners?: Array<{ displayName?: string }>;
    };
    expect(parsed.name).toBe("Report.pdf");
    expect(parsed.mimeType).toBe("application/pdf");
    expect(parsed.shared).toBe(true);
    expect(parsed.owners?.[0]?.displayName).toBe("Ada Lovelace");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fileId).toBe("meta-1");
  });
});
