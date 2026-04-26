#!/usr/bin/env node
/**
 * Synthetic MCP load for NF-02 / S5.2: sustain ~LOAD_TEST_RPS requests/sec of
 * tools/call search_files against a running server, report client-side p95, exit 1 if p95 > 3000ms.
 *
 * Env:
 *   LOAD_TEST_BASE_URL   (default http://127.0.0.1:8080)
 *   LOAD_TEST_RPS        (default 100)
 *   LOAD_TEST_DURATION_SEC (default 30)
 *   LOAD_TEST_WORKERS    (optional; default min(RPS, 100))
 */
import { performance } from "node:perf_hooks";

import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const MCP_POST_ACCEPT = "application/json, text/event-stream";

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:8080",
    rps: Number(process.env.LOAD_TEST_RPS ?? 100),
    durationSec: Number(process.env.LOAD_TEST_DURATION_SEC ?? 30),
    workers: process.env.LOAD_TEST_WORKERS
      ? Number(process.env.LOAD_TEST_WORKERS)
      : undefined,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--baseUrl" && argv[i + 1]) out.baseUrl = argv[++i];
    else if (a === "--rps" && argv[i + 1]) out.rps = Number(argv[++i]);
    else if (a === "--durationSec" && argv[i + 1]) out.durationSec = Number(argv[++i]);
    else if (a === "--workers" && argv[i + 1]) out.workers = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function initSession(baseUrl) {
  const body = {
    jsonrpc: "2.0",
    id: "load-init",
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "synthetic-mcp-latency", version: "0.0.0" },
    },
  };
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: MCP_POST_ACCEPT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`initialize HTTP ${res.status}`);
  }
  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("missing mcp-session-id");
  const json = await res.json();
  const negotiated = json?.result?.protocolVersion ?? DEFAULT_NEGOTIATED_PROTOCOL_VERSION;
  return { sessionId, negotiated };
}

async function toolsCallSearch(baseUrl, sessionId, negotiated) {
  const t0 = performance.now();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: MCP_POST_ACCEPT,
      "mcp-session-id": sessionId,
      "mcp-protocol-version": negotiated,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `call-${Math.random().toString(36).slice(2)}`,
      method: "tools/call",
      params: { name: "search_files", arguments: { q: "name contains 'x'" } },
    }),
  });
  await res.json().catch(() => null);
  return performance.now() - t0;
}

async function main() {
  const cfg = parseArgs(process.argv);
  if (cfg.help) {
    console.log(`Usage: node scripts/synthetic-mcp-latency.mjs [options]
Options:
  --baseUrl URL
  --rps N
  --durationSec N
  --workers N

Env mirrors: LOAD_TEST_BASE_URL, LOAD_TEST_RPS, LOAD_TEST_DURATION_SEC, LOAD_TEST_WORKERS`);
    process.exit(0);
  }

  const workers = cfg.workers ?? Math.min(100, Math.max(1, cfg.rps));
  const intervalMs = 1000 / (cfg.rps / workers);
  const deadline = Date.now() + cfg.durationSec * 1000;
  const latencies = [];

  const pool = Array.from({ length: workers }, (_, wid) =>
    (async () => {
      const { sessionId, negotiated } = await initSession(cfg.baseUrl);
      while (Date.now() < deadline) {
        const loopStart = performance.now();
        try {
          latencies.push(await toolsCallSearch(cfg.baseUrl, sessionId, negotiated));
        } catch (e) {
          console.error(`worker ${wid} error:`, e);
          process.exit(2);
        }
        const elapsed = performance.now() - loopStart;
        const wait = Math.max(0, intervalMs - elapsed);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    })(),
  );

  await Promise.all(pool);

  latencies.sort((a, b) => a - b);
  const p95 = percentile(latencies, 95);
  const p50 = percentile(latencies, 50);
  console.log(
    JSON.stringify(
      {
        samples: latencies.length,
        p50_ms: Math.round(p50 * 10) / 10,
        p95_ms: Math.round(p95 * 10) / 10,
        budget_ms: 3000,
        baseUrl: cfg.baseUrl,
        rps_target: cfg.rps,
        workers,
        duration_sec: cfg.durationSec,
      },
      null,
      2,
    ),
  );

  if (p95 > 3000) {
    console.error("FAIL: p95 exceeds 3000 ms budget");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
