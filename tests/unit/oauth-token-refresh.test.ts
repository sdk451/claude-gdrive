import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("TOK-22 OAuth refresh (F-08)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("oauth.refresh.silent_success — refresh_token grant returns new access without re-consent", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://oauth2.googleapis.com/token")) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      const bodyStr =
        typeof init?.body === "string" ? init.body : init?.body != null ? String(init.body) : "";
      const params = new URLSearchParams(bodyStr);
      const gt = params.get("grant_type");
      if (gt === "authorization_code") {
        return new Response(
          JSON.stringify({
            access_token: "google-access-initial",
            expires_in: 3600,
            refresh_token: "google-refresh-secret",
            scope: "openid email",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (gt === "refresh_token") {
        expect(params.get("refresh_token")).toBe("google-refresh-secret");
        return new Response(
          JSON.stringify({
            access_token: "google-access-refreshed",
            expires_in: 3599,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected grant_type: ${gt}`);
    });
    vi.stubGlobal("fetch", fetchMock);

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
    authUrl.searchParams.set("state", "st1");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const authRes = await app.request(`${authUrl.pathname}${authUrl.search}`, { method: "GET" });
    const google = new URL(authRes.headers.get("location")!);
    const signedState = google.searchParams.get("state")!;

    const cbUrl = new URL("http://127.0.0.1:3000/oauth/google/callback");
    cbUrl.searchParams.set("code", "google-auth-code");
    cbUrl.searchParams.set("state", signedState);
    const cbRes = await app.request(`${cbUrl.pathname}${cbUrl.search}`, { method: "GET" });
    const clientUrl = new URL(cbRes.headers.get("location")!);
    const opaque = clientUrl.searchParams.get("code")!;

    const tokenRes = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opaque,
        redirect_uri: CLAUDE_CALLBACK,
        client_id,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const first = (await tokenRes.json()) as { access_token: string; refresh_token: string };
    expect(first.access_token).toBe("google-access-initial");
    expect(first.refresh_token).toMatch(/^ref_/);
    expect(first.refresh_token).not.toContain("google-refresh");

    const refreshRes = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id,
      }).toString(),
    });
    expect(refreshRes.status).toBe(200);
    const second = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(second.access_token).toBe("google-access-refreshed");
    expect(second.refresh_token).toBe(first.refresh_token);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces reauth_required when Google rejects refresh", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith("https://oauth2.googleapis.com/token")) {
          throw new Error(`unexpected fetch: ${url}`);
        }
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({
              access_token: "a",
              expires_in: 3600,
              refresh_token: "rt-revoked",
              token_type: "Bearer",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

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
    authUrl.searchParams.set("state", "st2");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    const authRes = await app.request(`${authUrl.pathname}${authUrl.search}`, { method: "GET" });
    const google = new URL(authRes.headers.get("location")!);
    const cbUrl = new URL("http://127.0.0.1:3000/oauth/google/callback");
    cbUrl.searchParams.set("code", "c");
    cbUrl.searchParams.set("state", google.searchParams.get("state")!);
    const cbRes = await app.request(`${cbUrl.pathname}${cbUrl.search}`, { method: "GET" });
    const clientUrl = new URL(cbRes.headers.get("location")!);
    const opaque = clientUrl.searchParams.get("code")!;

    const tokenRes = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opaque,
        redirect_uri: CLAUDE_CALLBACK,
        client_id,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const { refresh_token } = (await tokenRes.json()) as { refresh_token: string };

    const bad = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id,
      }).toString(),
    });
    expect(bad.status).toBe(400);
    const err = (await bad.json()) as {
      error: string;
      reauth_required?: boolean;
    };
    expect(err.error).toBe("invalid_grant");
    expect(err.reauth_required).toBe(true);
  });

  it("rejects refresh_token grant with wrong client_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            access_token: "a",
            expires_in: 3600,
            refresh_token: "rt",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

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
    authUrl.searchParams.set("state", "st3");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    const authRes = await app.request(`${authUrl.pathname}${authUrl.search}`, { method: "GET" });
    const google = new URL(authRes.headers.get("location")!);
    const cbUrl = new URL("http://127.0.0.1:3000/oauth/google/callback");
    cbUrl.searchParams.set("code", "c");
    cbUrl.searchParams.set("state", google.searchParams.get("state")!);
    const cbRes = await app.request(`${cbUrl.pathname}${cbUrl.search}`, { method: "GET" });
    const clientUrl = new URL(cbRes.headers.get("location")!);
    const opaque = clientUrl.searchParams.get("code")!;

    const tokenRes = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: opaque,
        redirect_uri: CLAUDE_CALLBACK,
        client_id,
        code_verifier: codeVerifier,
      }).toString(),
    });
    const { refresh_token } = (await tokenRes.json()) as { refresh_token: string };

    const wrong = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id: "00000000-0000-4000-8000-000000000000",
      }).toString(),
    });
    expect(wrong.status).toBe(400);
    const err = (await wrong.json()) as { error: string };
    expect(err.error).toBe("invalid_grant");
  });
});
