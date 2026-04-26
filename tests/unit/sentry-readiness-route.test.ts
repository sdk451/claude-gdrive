import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockCapture, mockFlush } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockCapture: vi.fn(),
  mockFlush: vi.fn(() => Promise.resolve(true as const)),
}));

vi.mock("@sentry/node", () => ({
  init: mockInit,
  captureMessage: mockCapture,
  flush: mockFlush,
}));

describe("GET /__smoke/sentry-test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it("returns skipped when SENTRY_DSN is unset", async () => {
    vi.resetModules();
    const { createApp } = await import("../../src/server.js");
    const app = createApp();
    const res = await app.request("http://localhost/__smoke/sentry-test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "skipped",
      reason: "SENTRY_DSN not set",
    });
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initializes Sentry when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://key@o888888.ingest.sentry.io/8888888";
    vi.resetModules();
    const { createApp } = await import("../../src/server.js");
    const app = createApp();
    const res = await app.request("http://localhost/__smoke/sentry-test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "sent" });
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0,
      }),
    );
    expect(mockCapture).toHaveBeenCalledWith("gdrive-connector-readiness-smoke", {
      level: "info",
    });
    expect(mockFlush).toHaveBeenCalledWith(2000);
  });
});
