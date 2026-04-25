import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";

describe("GET /healthz", () => {
  it("returns 200 with a JSON ok status", async () => {
    const app = createApp();
    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const app = createApp();
    const response = await app.request("/does-not-exist");

    expect(response.status).toBe(404);
  });
});
