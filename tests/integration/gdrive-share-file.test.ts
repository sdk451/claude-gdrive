import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { DriveFilesPort, ShareFileParams } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-share-file", version: "0.0.0" },
    },
  };
}

describe("TOK-32 share_file integration (stubbed Drive)", () => {
  it("tools/call share_file grant without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-32-no-token-grant")),
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
        id: 80,
        method: "tools/call",
        params: {
          name: "share_file",
          arguments: {
            action: "grant",
            fileId: "f1",
            role: "reader",
            granteeType: "user",
            emailAddress: "a@b.co",
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

  it("tools/call share_file grant forwards to stub", async () => {
    const calls: ShareFileParams[] = [];
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
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile not used in this test");
      },
      async moveFile() {
        throw new Error("moveFile not used in this test");
      },
      async shareFile(params) {
        calls.push(params);
        if (params.action === "grant") {
          return {
            action: "grant",
            permissionId: "perm-new",
            type: params.granteeType,
            role: params.role,
          };
        }
        return { action: "revoke", deleted: true };
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-32-grant")),
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
        id: 81,
        method: "tools/call",
        params: {
          name: "share_file",
          arguments: {
            action: "grant",
            fileId: "doc-x",
            role: "writer",
            granteeType: "user",
            emailAddress: "x@y.z",
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
      action: "grant",
      fileId: "doc-x",
      role: "writer",
      granteeType: "user",
      emailAddress: "x@y.z",
    });
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      action: string;
      permissionId: string;
    };
    expect(parsed.action).toBe("grant");
    expect(parsed.permissionId).toBe("perm-new");
  });

  it("tools/call share_file revoke forwards to stub", async () => {
    const calls: ShareFileParams[] = [];
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
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile not used in this test");
      },
      async moveFile() {
        throw new Error("moveFile not used in this test");
      },
      async shareFile(params) {
        calls.push(params);
        return { action: "revoke", deleted: true };
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-32-revoke")),
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
        id: 82,
        method: "tools/call",
        params: {
          name: "share_file",
          arguments: {
            action: "revoke",
            fileId: "doc-x",
            permissionId: "perm-99",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).not.toBe(true);
    expect(calls[0]).toEqual({
      action: "revoke",
      fileId: "doc-x",
      permissionId: "perm-99",
    });
  });

  it("tools/call share_file grant user without emailAddress returns isError", async () => {
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
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile not used in this test");
      },
      async moveFile() {
        throw new Error("moveFile not used in this test");
      },
      async shareFile() {
        throw new Error("shareFile should not be reached");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-32-bad-grant")),
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
        id: 83,
        method: "tools/call",
        params: {
          name: "share_file",
          arguments: {
            action: "grant",
            fileId: "f9",
            role: "reader",
            granteeType: "user",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/emailAddress is required/i);
  });

  it("tools/call share_file revoke without permissionId returns isError", async () => {
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
        throw new Error("createFile not used in this test");
      },
      async updateFile() {
        throw new Error("updateFile not used in this test");
      },
      async moveFile() {
        throw new Error("moveFile not used in this test");
      },
      async shareFile() {
        throw new Error("shareFile should not be reached");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-32-bad-revoke")),
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
        id: 84,
        method: "tools/call",
        params: {
          name: "share_file",
          arguments: {
            action: "revoke",
            fileId: "f9",
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/permissionId is required/i);
  });
});
