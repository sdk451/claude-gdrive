import { describe, expect, it } from "vitest";

import {
  buildAuthorizationServerMetadata,
  normalizeIssuerBaseUrl,
} from "../../src/oauth/authorization-server-metadata.js";

describe("normalizeIssuerBaseUrl", () => {
  it("strips trailing slashes on the issuer URL", () => {
    expect(normalizeIssuerBaseUrl("https://as.example.com/")).toBe("https://as.example.com");
    expect(normalizeIssuerBaseUrl("https://as.example.com")).toBe("https://as.example.com");
  });

  it("rejects empty input", () => {
    expect(() => normalizeIssuerBaseUrl("")).toThrow();
    expect(() => normalizeIssuerBaseUrl("   ")).toThrow();
  });
});

describe("buildAuthorizationServerMetadata", () => {
  it("includes RFC 8414 required fields and PKCE support", () => {
    const meta = buildAuthorizationServerMetadata("https://connector.example.com");
    expect(meta.issuer).toBe("https://connector.example.com");
    expect(meta.authorization_endpoint).toBe("https://connector.example.com/oauth/authorize");
    expect(meta.token_endpoint).toBe("https://connector.example.com/oauth/token");
    expect(meta.response_types_supported).toEqual(["code"]);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code"]));
    expect(meta.scopes_supported).toEqual(
      expect.arrayContaining(["https://www.googleapis.com/auth/drive.file"]),
    );
  });

  it("computes metadata synchronously for fast discovery responses", () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      buildAuthorizationServerMetadata("https://as.example.test");
    }
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
