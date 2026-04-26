#!/usr/bin/env node
/**
 * Append a single TestRunRecord to docs/test-runs/test-runs.jsonl.
 *
 * Idempotency: if an identical (sha, runId, job) tuple already exists, do nothing.
 *
 * Input:
 *   reports/test-run-record.json
 *
 * Output:
 *   docs/test-runs/test-runs.jsonl (appended)
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const recordPath = join(process.cwd(), "reports", "test-run-record.json");
if (!existsSync(recordPath)) {
  process.stderr.write(`append-test-run-log: missing ${recordPath}\n`);
  process.exit(2);
}

const record = JSON.parse(readFileSync(recordPath, "utf8"));
if (!record || record.schema !== "gdrive.testRunRecord.v1") {
  process.stderr.write(`append-test-run-log: unexpected record schema\n`);
  process.exit(2);
}

const outDir = join(process.cwd(), "docs", "test-runs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "test-runs.jsonl");

const sha = record?.git?.sha ?? "";
const runId = record?.links?.actionsMeta?.runId ?? "";
const job = record?.links?.actionsJob ?? "";

const key = `${sha}::${runId}::${job}`;

if (existsSync(outPath)) {
  const existing = readFileSync(outPath, "utf8");
  for (const line of existing.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      if (obj?.schema !== "gdrive.testRunRecord.v1") continue;
      const eKey = `${obj?.git?.sha ?? ""}::${obj?.links?.actionsMeta?.runId ?? ""}::${obj?.links?.actionsJob ?? ""}`;
      if (eKey === key) {
        process.stdout.write(`append-test-run-log: already present (${key})\n`);
        process.exit(0);
      }
    } catch {
      // ignore malformed lines
    }
  }
}

appendFileSync(outPath, JSON.stringify(record) + "\n", "utf8");
process.stdout.write(`append-test-run-log: appended (${key})\n`);

