import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type {
  DriveFilesPort,
  UpdateFileParams,
  UpdateFileResult,
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
      clientInfo: { name: "vitest-update-file", version: "0.0.0" },
    },
  };
}

describe("TOK-30 update_file integration (stubbed Drive)", () => {
  it("tools/call update_file without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-no-token")),
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
        id: 60,
        method: "tools/call",
        params: {
          name: "update_file",
          arguments: {
            fileId: "abc123",
            name: "Renamed",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/not connected|OAuth|Complete OAuth/i);
  });

  it("tools/call update_file forwards metadata fields to stub", async () => {
    const calls: UpdateFileParams[] = [];
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
      async listFilePermissions() {
        throw new Error("listFilePermissions not used in this test");
      },
      async createFile() {
        throw new Error("createFile not used in this test");
      },
      async updateFile(params) {
        calls.push(params);
        const r: UpdateFileResult = { id: params.fileId, name: params.name ?? "x" };
        if (params.mimeType !== undefined) {
          r.mimeType = params.mimeType;
        }
        return r;
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-int-meta")),
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
        id: 61,
        method: "tools/call",
        params: {
          name: "update_file",
          arguments: {
            fileId: "file-1",
            name: "New title",
            mimeType: "application/pdf",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      fileId: "file-1",
      name: "New title",
      mimeType: "application/pdf",
    });
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      id: string;
      name: string;
      mimeType?: string;
    };
    expect(parsed.id).toBe("file-1");
    expect(parsed.name).toBe("New title");
    expect(parsed.mimeType).toBe("application/pdf");
  });

  it("tools/call update_file forwards media fields to stub", async () => {
    const calls: UpdateFileParams[] = [];
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
      async listFilePermissions() {
        throw new Error("listFilePermissions not used in this test");
      },
      async createFile() {
        throw new Error("createFile not used in this test");
      },
      async updateFile(params) {
        calls.push(params);
        return { id: params.fileId, name: "blob.bin" };
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-int-media")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id")!;
    const negotiated = ((await initRes.json()) as { result: { protocolVersion: string } }).result
      .protocolVersion;

    const b64 = Buffer.from("hi").toString("base64");
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
        id: 62,
        method: "tools/call",
        params: {
          name: "update_file",
          arguments: {
            fileId: "f42",
            mediaBase64: b64,
            mediaMimeType: "application/octet-stream",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    expect(calls[0]?.mediaBase64).toBe(b64);
    expect(calls[0]?.mediaMimeType).toBe("application/octet-stream");
  });

  it("tools/call update_file with mediaBase64 but no mediaMimeType returns isError", async () => {
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
      async listFilePermissions() {
        throw new Error("listFilePermissions not used in this test");
      },
      async createFile() {
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile should not be reached");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-bad-media")),
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
        id: 63,
        method: "tools/call",
        params: {
          name: "update_file",
          arguments: {
            fileId: "f9",
            mediaBase64: Buffer.from("x").toString("base64"),
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/mediaMimeType is required/i);
  });

  it("tools/call update_file with only fileId returns isError", async () => {
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
      async listFilePermissions() {
        throw new Error("listFilePermissions not used in this test");
      },
      async createFile() {
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile should not be reached");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-30-only-id")),
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
        id: 64,
        method: "tools/call",
        params: {
          name: "update_file",
          arguments: { fileId: "only-id" },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(
      /at least one of name, mimeType, or mediaBase64/i,
    );
  });
});
