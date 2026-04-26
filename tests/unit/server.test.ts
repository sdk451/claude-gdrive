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
  it("returns 200 with RFC 8414-shaped JSON metadata", async () => {
    const app = createApp({ oauthIssuerBaseUrl: "https://oauth.test" });
    const response = await app.request("/.well-known/oauth-authorization-server");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.issuer).toBe("https://oauth.test");
    expect(body.authorization_endpoint).toBe("https://oauth.test/oauth/authorize");
    expect(body.token_endpoint).toBe("https://oauth.test/oauth/token");
    expect(body.registration_endpoint).toBe("https://oauth.test/oauth/register");
    expect(body.response_types_supported).toEqual(["code"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("responds within 200 ms p95 over repeated in-process requests", async () => {
    const app = createApp({ oauthIssuerBaseUrl: "https://latency.test" });
    const latencies: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const response = await app.request("/.well-known/oauth-authorization-server");
      latencies.push(performance.now() - t0);
      expect(response.status).toBe(200);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(0.95 * (latencies.length - 1))]!;
    expect(p95).toBeLessThan(200);
  });
});
