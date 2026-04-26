import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "../../src/observability/logger.js";

function createStringDestination() {
  let out = "";
  const dest = new Writable({
    write(chunk, _encoding, cb) {
      out += chunk.toString("utf8");
      cb();
    },
  });

  return { dest, read: () => out };
}

describe("observability redaction", () => {
  it("redacts common secret-bearing fields with [redacted]", () => {
    const { dest, read } = createStringDestination();
    const logger = createLogger({ level: "info", destination: dest });

    logger.info({
      authorization: "Bearer real",
      cookie: "sid=real",
      access_token: "real",
      refresh_token: "real",
      code: "real",
      id_token: "real",
      req: {
        headers: {
          authorization: "Bearer real",
          cookie: "sid=real",
        },
      },
    });

    const lines = read().trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);

    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.authorization).toBe("[redacted]");
    expect(parsed.cookie).toBe("[redacted]");
    expect(parsed.access_token).toBe("[redacted]");
    expect(parsed.refresh_token).toBe("[redacted]");
    expect(parsed.code).toBe("[redacted]");
    expect(parsed.id_token).toBe("[redacted]");
    expect(parsed.req.headers.authorization).toBe("[redacted]");
    expect(parsed.req.headers.cookie).toBe("[redacted]");
  });
});
