import crypto from "node:crypto";
import pino, { type Logger } from "pino";
import { createRedaction } from "./redaction.js";

export type CreateLoggerOptions = {
  level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  destination?: pino.DestinationStream | NodeJS.WritableStream;
};

export type RequestLogFields = {
  request_id: string;
  session_id_hash: string | null;
  method: string;
  path: string;
  status: number;
  outcome: "success" | "client_error" | "server_error";
  latency_ms: number;
};

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const destination = (opts.destination ?? pino.destination(1)) as pino.DestinationStream;

  return pino(
    {
      level: opts.level ?? "info",
      redact: createRedaction(),
    },
    destination,
  );
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function hashSessionId(sessionId: string): string {
  // 12 hex chars is enough to correlate logs without leaking raw IDs.
  return crypto.createHash("sha256").update(sessionId, "utf8").digest("hex").slice(0, 12);
}

export function outcomeFromStatus(status: number): RequestLogFields["outcome"] {
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "success";
}
