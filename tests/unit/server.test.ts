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

describe("GET /.well-known/oauth-authorization-server", () => {
  it("returns 200 with JSON metadata", async () => {
    const app = createApp();
    const response = await app.request("/.well-known/oauth-authorization-server");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toHaveProperty("issuer");
    expect(body).toHaveProperty("authorization_endpoint");
    expect(body).toHaveProperty("token_endpoint");
  });
});
