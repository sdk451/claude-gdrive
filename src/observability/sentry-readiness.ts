export type ReadinessSentryResult =
  | { status: "skipped"; reason: string }
  | { status: "sent" }
  | { status: "sent"; reason: string };

/**
 * Optional one-shot Sentry ping for staging / readiness checks.
 * Does not import `@sentry/node` unless `SENTRY_DSN` is non-empty.
 */
export async function readinessSentryPing(): Promise<ReadinessSentryResult> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return { status: "skipped", reason: "SENTRY_DSN not set" };
  }

  const { init, captureMessage, flush } = await import("@sentry/node");
  init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV ?? "development",
  });
  captureMessage("gdrive-connector-readiness-smoke", { level: "info" });
  const flushed = await flush(2000);
  if (!flushed) {
    return { status: "sent", reason: "flush did not complete within timeout" };
  }
  return { status: "sent" };
}
