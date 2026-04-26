import { describe, expect, it } from "vitest";

import { ENV_EXAMPLE_FILE, parseBootEnv } from "../../src/config/env.js";

const validSession = "0".repeat(64);

describe("parseBootEnv", () => {
  it("rejects when required keys are absent", () => {
    const r = parseBootEnv({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("GOOGLE_CLIENT_ID");
    expect(r.message).toContain("GOOGLE_CLIENT_SECRET");
    expect(r.message).toContain("SESSION_SECRET");
    expect(r.message).toContain(ENV_EXAMPLE_FILE);
    expect(r.message).not.toMatch(/\n/);
  });

  it("rejects empty-string secrets after trim", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: " ",
      GOOGLE_CLIENT_SECRET: "\t",
      SESSION_SECRET: "   ",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects SESSION_SECRET with wrong length", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "x.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "not-a-real-secret",
      SESSION_SECRET: "a".repeat(63),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("SESSION_SECRET");
    expect(r.message).toContain(ENV_EXAMPLE_FILE);
    expect(r.message).not.toMatch(/\n/);
  });

  it("rejects SESSION_SECRET with non-hex characters", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "x.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "not-a-real-secret",
      SESSION_SECRET: `${"a".repeat(63)}g`,
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a valid boot env and normalizes session secret hex", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-not-a-real-secret",
      SESSION_SECRET: `${"A".repeat(32)}${"b".repeat(32)}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sessionSecretHex).toBe(`${"a".repeat(32)}${"b".repeat(32)}`);
    expect(r.value.googleClientId).toBe("123.apps.googleusercontent.com");
    expect(r.value.publicIssuerOrigin).toBe("http://127.0.0.1:3000");
  });

  it("uses PUBLIC_ISSUER_URL when set", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-not-a-real-secret",
      SESSION_SECRET: validSession,
      PUBLIC_ISSUER_URL: "https://mcp.example.com/",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.publicIssuerOrigin).toBe("https://mcp.example.com");
  });

  it("rejects invalid PUBLIC_ISSUER_URL", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-not-a-real-secret",
      SESSION_SECRET: validSession,
      PUBLIC_ISSUER_URL: "not a url",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("PUBLIC_ISSUER_URL");
  });

  it("accepts all-zero SESSION_SECRET (CI / test fixture)", () => {
    const r = parseBootEnv({
      GOOGLE_CLIENT_ID: "ci.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "ci-secret",
      SESSION_SECRET: validSession,
    });
    expect(r.ok).toBe(true);
  });
});
