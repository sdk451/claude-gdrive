import { describe, expect, it } from "vitest";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import type { DriveFilesPort, MoveFileParams } from "../../src/drive/drive-files-port.js";
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
      clientInfo: { name: "vitest-move-file", version: "0.0.0" },
    },
  };
}

describe("TOK-31 move_file integration (stubbed Drive)", () => {
  it("tools/call move_file without stub returns isError (no token yet)", async () => {
    const app = createApp();

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-31-no-token")),
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
        id: 70,
        method: "tools/call",
        params: {
          name: "move_file",
          arguments: {
            fileId: "doc1",
            addParentFolderId: "folderB",
            removeParentFolderId: "folderA",
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

  it("tools/call move_file forwards parent ids to stub", async () => {
    const calls: MoveFileParams[] = [];
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
      async moveFile(params) {
        calls.push(params);
        return { id: params.fileId, name: "Moved item" };
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
      body: JSON.stringify(initializeBody("tok-31-int")),
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
        id: 71,
        method: "tools/call",
        params: {
          name: "move_file",
          arguments: {
            fileId: "item-9",
            addParentFolderId: "dest-2",
            removeParentFolderId: "src-1",
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
      fileId: "item-9",
      addParentFolderId: "dest-2",
      removeParentFolderId: "src-1",
    });
    const parsed = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      id: string;
      name: string;
    };
    expect(parsed.id).toBe("item-9");
    expect(parsed.name).toBe("Moved item");
  });
});
