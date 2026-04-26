import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { DriveFilesPort, ReadFileContentParams } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-read-file", version: "0.0.0" },
    },
  };
}

describe("TOK-24 read_file_content integration (stubbed Drive)", () => {
  it("tools/call read_file_content without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-24-no-token")),
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
        id: 20,
        method: "tools/call",
        params: { name: "read_file_content", arguments: { fileId: "abc123" } },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/not connected|OAuth|Complete OAuth/i);
  });

  it("tools/call read_file_content forwards fileId and exportMimeType to stub", async () => {
    const reads: ReadFileContentParams[] = [];
    const stub: DriveFilesPort = {
      async listFiles() {
        return { files: [] };
      },
      async readFileContent(params) {
        reads.push(params);
        return {
          mimeType: "text/plain",
          encoding: "utf-8",
          data: "Hello, Doc",
        };
      },
      async downloadFileContent() {
        throw new Error("downloadFileContent not used in this test");
      },
      async getFileMetadata() {
        throw new Error("getFileMetadata not used in this test");
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
      async moveFile() {
        throw new Error("moveFile not used in this test");
      },
      async shareFile() {
        throw new Error("shareFile not used in this test");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-24-int")),
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
        id: 21,
        method: "tools/call",
        params: {
          name: "read_file_content",
          arguments: { fileId: "doc-1", exportMimeType: "text/plain" },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      mimeType: string;
      encoding: string;
      data: string;
    };
    expect(parsed.data).toBe("Hello, Doc");
    expect(parsed.encoding).toBe("utf-8");

    expect(reads).toHaveLength(1);
    expect(reads[0]?.fileId).toBe("doc-1");
    expect(reads[0]?.exportMimeType).toBe("text/plain");
  });
});
