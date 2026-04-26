import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/server.js";
import { pkceS256Challenge } from "../../src/oauth/pkce.js";

const SESSION_HEX = "0".repeat(64);

const oauthOpts = {
  issuerBaseUrl: "http://127.0.0.1:3000",
  googleClientId: "test.apps.googleusercontent.com",
  googleClientSecret: "test-google-secret",
  sessionSecretHex: SESSION_HEX,
} as const;

const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

describe("TOK-21 DCR + PKCE onboarding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "google-access-test",
              expires_in: 3600,
              refresh_token: "google-refresh-test",
              scope: "openid email",
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  it("rejects DCR registration with invalid redirect_uris", async () => {
    const app = createApp({ oauth: { ...oauthOpts } });
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://evil.com/cb"] }),
    });
    expect(res.status).toBe(400);
  });

  it("registers a public client including the hosted Claude callback (F-11)", async () => {
    const app = createApp({ oauth: { ...oauthOpts } });
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [CLAUDE_CALLBACK],
        client_name: "Cowork test",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id: string; token_endpoint_auth_method: string };
    expect(body.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("rejects /oauth/authorize without PKCE (F-07)", async () => {
    const app = createApp({ oauth: { ...oauthOpts } });
    const reg = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [CLAUDE_CALLBACK] }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };

    const url = new URL("http://127.0.0.1/oauth/authorize");
    url.searchParams.set("client_id", client_id);
    url.searchParams.set("redirect_uri", CLAUDE_CALLBACK);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", "st");
    const res = await app.request(`${url.pathname}${url.search}`, { method: "GET" });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toBe("invalid_request");
  });

  it("runs authorize → Google callback → token with PKCE verified at /oauth/token", async () => {
    const app = createApp({ oauth: { ...oauthOpts } });
    const reg = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [CLAUDE_CALLBACK] }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };

    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = pkceS256Challenge(codeVerifier);

    const authUrl = new URL("http://127.0.0.1:3000/oauth/authorize");
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("redirect_uri", CLAUDE_CALLBACK);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", "client-state-xyz");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const authRes = await app.request(`${authUrl.pathname}${authUrl.search}`, { method: "GET" });
    expect(authRes.status).toBe(302);
    const loc = authRes.headers.get("location");
    expect(loc).toBeTruthy();
    const google = new URL(loc!);
    expect(google.hostname).toBe("accounts.google.com");
    const signedState = google.searchParams.get("state");
    expect(signedState).toBeTruthy();

    const cbUrl = new URL("http://127.0.0.1:3000/oauth/google/callback");
    cbUrl.searchParams.set("code", "google-auth-code-test");
    cbUrl.searchParams.set("state", signedState!);
    const cbRes = await app.request(`${cbUrl.pathname}${cbUrl.search}`, { method: "GET" });
    expect(cbRes.status).toBe(302);
    const clientLoc = cbRes.headers.get("location");
    expect(clientLoc).toBeTruthy();
    const clientUrl = new URL(clientLoc!);
    expect(clientUrl.origin + clientUrl.pathname).toBe(CLAUDE_CALLBACK);
    const opaque = clientUrl.searchParams.get("code");
    expect(opaque).toBeTruthy();
    expect(clientUrl.searchParams.get("state")).toBe("client-state-xyz");

    const badToken = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opaque!,
        redirect_uri: CLAUDE_CALLBACK,
        client_id,
        code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier-wrong",
      }).toString(),
    });
    expect(badToken.status).toBe(400);

    const goodToken = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opaque!,
        redirect_uri: CLAUDE_CALLBACK,
        client_id,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(goodToken.status).toBe(200);
    const tokens = (await goodToken.json()) as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
    };
    expect(tokens.access_token).toBe("google-access-test");
    expect(tokens.refresh_token).toBe("google-refresh-test");
    expect(tokens.token_type).toBe("Bearer");
  });
});
