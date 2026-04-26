import { createLogger } from "./logger.js";

const logger = createLogger({
  level: process.env.VITEST === "true" ? "silent" : "info",
});

let toolsListEmptyTotal = 0;

export function getToolsListEmptyTotal(): number {
  return toolsListEmptyTotal;
}

/** Test-only reset — production code must not call. */
export function resetToolsListEmptyTotalForTests(): void {
  toolsListEmptyTotal = 0;
}

/**
 * If `body` is a successful JSON-RPC `tools/list` payload with `result.tools === []`,
 * increments `tools_list_empty_total` and emits a structured log for log-based alerting.
 */
export function inspectToolsListJsonRpcResponse(body: unknown, sessionIdHash: string | null): void {
  if (!body || typeof body !== "object") return;
  const rec = body as { error?: unknown; result?: { tools?: unknown } };
  if (rec.error !== undefined) return;
  const tools = rec.result?.tools;
  if (!Array.isArray(tools) || tools.length !== 0) return;

  toolsListEmptyTotal += 1;
  logger.warn({
    msg: "tools.list.empty",
    metric: "tools_list_empty_total",
    session_id_hash: sessionIdHash,
    outcome: "error",
  });
}
