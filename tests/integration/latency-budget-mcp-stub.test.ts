import { randomUUID } from "node:crypto";
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
      clientInfo: { name: "vitest-latency-budget", version: "0.0.0" },
    },
  };
}

function percentileMs(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

describe("TOK-41 / S5.2 latency budget (stubbed Drive)", () => {
  it("NF-02: p95 tools/call search_files stays within 3s under high concurrency (stub Drive)", async () => {
    const stub: DriveFilesPort = {
      async listFiles(_params: ListFilesParams) {
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25)));
        return {
          files: [{ id: "f1", name: "doc", mimeType: "application/pdf" }],
        };
      },
      async listFolder() {
        throw new Error("listFolder not used");
      },
      async readFileContent() {
        throw new Error("readFileContent not used");
      },
      async downloadFileContent() {
        throw new Error("downloadFileContent not used");
      },
      async getFileMetadata() {
        throw new Error("getFileMetadata not used");
      },
      async listFilePermissions() {
        throw new Error("listFilePermissions not used");
      },
      async createFile() {
        throw new Error("createFile not used");
      },
      async updateFile() {
        throw new Error("updateFile not used");
      },
      async moveFile() {
        throw new Error("moveFile not used");
      },
      async shareFile() {
        throw new Error("shareFile not used");
      },
    };

    const app = createApp({ driveFiles: stub });

    const initRes = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: MCP_POST_ACCEPT,
      },
      body: JSON.stringify(initializeBody("tok-41-latency")),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id")!;
    const negotiated = ((await initRes.json()) as { result: { protocolVersion: string } }).result
      .protocolVersion;

    const TOTAL = 1600;
    const WORKERS = 64;
    let next = 0;
    const latencies: number[] = [];

    async function oneCall(): Promise<void> {
      const t0 = performance.now();
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
          id: `lat-${randomUUID()}`,
          method: "tools/call",
          params: { name: "search_files", arguments: { q: "name contains 'x'" } },
        }),
      });
      latencies.push(performance.now() - t0);
      expect(callRes.status).toBe(200);
      const body = (await callRes.json()) as {
        result?: { isError?: boolean };
        error?: unknown;
      };
      expect(body.error).toBeUndefined();
      expect(body.result?.isError).not.toBe(true);
    }

    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= TOTAL) return;
        await oneCall();
      }
    }

    await Promise.all(Array.from({ length: WORKERS }, () => worker()));

    latencies.sort((a, b) => a - b);
    const p95 = percentileMs(latencies, 95);
    expect(latencies.length).toBe(TOTAL);
    expect(p95).toBeLessThan(3000);
  }, 120_000);
});
