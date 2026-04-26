import { afterEach, describe, expect, it } from "vitest";

import {
  getToolsListEmptyTotal,
  inspectToolsListJsonRpcResponse,
  resetToolsListEmptyTotalForTests,
} from "../../src/observability/tools-list-empty.js";

describe("tools_list_empty_total (TOK-40)", () => {
  afterEach(() => {
    resetToolsListEmptyTotalForTests();
  });

  it("increments when inspect sees successful tools/list with empty tools", () => {
    expect(getToolsListEmptyTotal()).toBe(0);
    inspectToolsListJsonRpcResponse({ result: { tools: [] }, id: 1 }, "deadbeef0000");
    expect(getToolsListEmptyTotal()).toBe(1);
  });

  it("does not increment on JSON-RPC error payloads", () => {
    inspectToolsListJsonRpcResponse(
      { error: { code: -32001, message: "Session not found" }, id: null },
      null,
    );
    expect(getToolsListEmptyTotal()).toBe(0);
  });

  it("does not increment when tools are present", () => {
    inspectToolsListJsonRpcResponse({ result: { tools: [{ name: "search_files" }] }, id: 1 }, null);
    expect(getToolsListEmptyTotal()).toBe(0);
  });
});
