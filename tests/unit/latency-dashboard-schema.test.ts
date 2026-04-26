import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("latency dashboard JSON (TOK-41)", () => {
  it("parses and declares Cloud Run latency widgets", () => {
    const raw = readFileSync(
      join(__dirname, "../../infra/observability/latency-dashboard.json"),
      "utf8",
    );
    const doc = JSON.parse(raw) as {
      displayName?: string;
      gridLayout?: { widgets?: unknown[] };
    };
    expect(doc.displayName).toContain("latency");
    expect(doc.displayName).toContain("S5.2");
    expect(Array.isArray(doc.gridLayout?.widgets)).toBe(true);
    expect(doc.gridLayout!.widgets!.length).toBeGreaterThanOrEqual(1);
    const blob = JSON.stringify(doc);
    expect(blob).toContain("run.googleapis.com/request_latencies");
    expect(blob).toContain("cloud_run_revision");
  });
});
