import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { CreateFileParams, DriveFilesPort } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-create-file", version: "0.0.0" },
    },
  };
}

describe("TOK-28 create_file integration (stubbed Drive)", () => {
  it("tools/call create_file without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-28-no-token")),
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
          name: "create_file",
          arguments: {
            name: "Folder A",
            mimeType: "application/vnd.google-apps.folder",
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

  it("tools/call create_file forwards metadata fields to stub", async () => {
    const calls: CreateFileParams[] = [];
    const stub: DriveFilesPort = {
      async listFiles() {
        return { files: [] };
      },
      async listFolder() {
        throw new Error("listFolder not used in this test");
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
      async createFile(params) {
        calls.push(params);
        return {
          id: "new-folder-1",
          name: params.name,
          mimeType: params.mimeType,
        };
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
      body: JSON.stringify(initializeBody("tok-28-int-meta")),
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
          name: "create_file",
          arguments: {
            name: "Q1 Sheet",
            mimeType: "application/vnd.google-apps.spreadsheet",
            parentFolderId: "parent-99",
          },
        },
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
    };
    expect(parsed.id).toBe("new-folder-1");
    expect(parsed.name).toBe("Q1 Sheet");
    expect(parsed.mimeType).toBe("application/vnd.google-apps.spreadsheet");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("Q1 Sheet");
    expect(calls[0]?.parentFolderId).toBe("parent-99");
  });

  it("tools/call create_file forwards media fields to stub", async () => {
    const calls: CreateFileParams[] = [];
    const stub: DriveFilesPort = {
      async listFiles() {
        return { files: [] };
      },
      async listFolder() {
        throw new Error("listFolder not used in this test");
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
      async createFile(params) {
        calls.push(params);
        return { id: "blob-1", name: params.name, mimeType: params.mimeType };
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
      body: JSON.stringify(initializeBody("tok-28-int-media")),
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
        id: 62,
        method: "tools/call",
        params: {
          name: "create_file",
          arguments: {
            name: "note.txt",
            mimeType: "text/plain",
            mediaBase64: Buffer.from("hi").toString("base64"),
            mediaMimeType: "text/plain",
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
    expect(calls[0]?.mediaBase64).toBeDefined();
    expect(calls[0]?.mediaMimeType).toBe("text/plain");
  });

  it("tools/call create_file with mediaBase64 but no mediaMimeType returns isError", async () => {
    const stub: DriveFilesPort = {
      async listFiles() {
        return { files: [] };
      },
      async listFolder() {
        throw new Error("listFolder not used in this test");
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
        return { id: "x", name: "x" };
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
      body: JSON.stringify(initializeBody("tok-28-int-bad-media")),
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
          name: "create_file",
          arguments: {
            name: "bad.txt",
            mimeType: "text/plain",
            mediaBase64: "QQ==",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/mediaMimeType/i);
  });
});
