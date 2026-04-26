import { randomBytes, randomUUID } from "node:crypto";
import type { Context, Hono } from "hono";
import { normalizeIssuerBaseUrl } from "./authorization-server-metadata.js";
import { signOAuthState, verifyOAuthState } from "./oauth-state.js";
import { pkceS256Challenge } from "./pkce.js";

const DEFAULT_SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export type OauthRouteConfig = {
  issuerBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  sessionSecretHex: string;
};

type DcrRecord = {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
};

type PendingGoogle = {
  /** PKCE challenge from the MCP client (verified at our `/oauth/token`). */
  client_code_challenge: string;
  /** PKCE verifier for the Google authorization-code exchange only. */
  google_code_verifier: string;
  dcr_client_id: string;
  client_redirect_uri: string;
  client_state: string;
  scope: string;
};

type IssuedCode = {
  client_code_challenge: string;
  dcr_client_id: string;
  client_redirect_uri: string;
  google_access_token: string;
  google_refresh_token: string;
  google_expires_in: number;
  google_token_type: string;
  google_scope: string;
};

function jsonError(c: Context, error: string, error_description: string) {
  return c.json({ error, error_description }, 400);
}

function isSafeRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
    return true;
  }
  return false;
}

function redirectWithError(
  clientRedirect: string,
  clientState: string,
  err: string,
  desc: string,
): Response {
  const u = new URL(clientRedirect);
  u.searchParams.set("error", err);
  u.searchParams.set("error_description", desc);
  u.searchParams.set("state", clientState);
  return Response.redirect(u.toString(), 302);
}

export function mountOauthRoutes(app: Hono, cfg: OauthRouteConfig): void {
  const issuer = normalizeIssuerBaseUrl(cfg.issuerBaseUrl);
  const googleCallbackUri = new URL("/oauth/google/callback", `${issuer}/`).href;
  const dcrClients = new Map<string, DcrRecord>();
  const pendingByNonce = new Map<string, PendingGoogle>();
  const issuedByCode = new Map<string, IssuedCode>();

  app.post("/oauth/register", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(c, "invalid_client_metadata", "Body must be JSON");
    }
    if (!body || typeof body !== "object") {
      return jsonError(c, "invalid_client_metadata", "Body must be an object");
    }
    const o = body as Record<string, unknown>;
    const redirectUris = o.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      return jsonError(c, "invalid_redirect_uri", "redirect_uris must be a non-empty array");
    }
    const uris: string[] = [];
    for (const r of redirectUris) {
      if (typeof r !== "string" || !isSafeRedirectUri(r)) {
        return jsonError(
          c,
          "invalid_redirect_uri",
          "Each redirect_uri must be https or http on localhost/127.0.0.1",
        );
      }
      uris.push(r);
    }
    const client_name = typeof o.client_name === "string" ? o.client_name : undefined;
    const client_id = randomUUID();
    const record: DcrRecord = {
      client_id,
      redirect_uris: uris,
      ...(client_name ? { client_name } : {}),
    };
    dcrClients.set(client_id, record);
    return c.json(
      {
        client_id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        redirect_uris: uris,
        ...(client_name ? { client_name } : {}),
      },
      201,
    );
  });

  app.get("/oauth/authorize", (c) => {
    const client_id = c.req.query("client_id");
    const redirect_uri = c.req.query("redirect_uri");
    const response_type = c.req.query("response_type");
    const state = c.req.query("state");
    const code_challenge = c.req.query("code_challenge");
    const code_challenge_method = c.req.query("code_challenge_method");
    const scope = c.req.query("scope")?.trim() || DEFAULT_SCOPE;

    if (!client_id || !redirect_uri || !response_type || !state) {
      return jsonError(c, "invalid_request", "Missing required query parameters");
    }
    if (response_type !== "code") {
      return jsonError(c, "unsupported_response_type", "Only response_type=code is supported");
    }
    if (!code_challenge || !code_challenge_method) {
      return jsonError(
        c,
        "invalid_request",
        "PKCE code_challenge and code_challenge_method are required",
      );
    }
    if (code_challenge_method !== "S256") {
      return jsonError(c, "invalid_request", "Only code_challenge_method=S256 is supported");
    }

    const reg = dcrClients.get(client_id);
    if (!reg) {
      return jsonError(c, "invalid_client", "Unknown client_id");
    }
    if (!reg.redirect_uris.includes(redirect_uri)) {
      return jsonError(c, "invalid_request", "redirect_uri is not registered for this client");
    }

    const client_code_challenge = code_challenge;
    const google_code_verifier = randomBytes(32).toString("base64url");
    const google_code_challenge = pkceS256Challenge(google_code_verifier);

    const nonce = randomBytes(24).toString("base64url");
    pendingByNonce.set(nonce, {
      client_code_challenge,
      google_code_verifier,
      dcr_client_id: client_id,
      client_redirect_uri: redirect_uri,
      client_state: state,
      scope,
    });

    const signed = signOAuthState(cfg.sessionSecretHex, {
      v: 1,
      n: nonce,
      exp: Date.now() + 600_000,
    });

    const params = new URLSearchParams({
      client_id: cfg.googleClientId,
      redirect_uri: googleCallbackUri,
      response_type: "code",
      scope,
      state: signed,
      code_challenge: google_code_challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });
    const location = `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
    return c.redirect(location, 302);
  });

  app.get("/oauth/google/callback", async (c) => {
    const err = c.req.query("error");
    const errDesc = c.req.query("error_description") ?? "";
    const code = c.req.query("code");
    const stateToken = c.req.query("state");

    if (!stateToken) {
      return jsonError(c, "invalid_request", "Missing state");
    }
    const st = verifyOAuthState(cfg.sessionSecretHex, stateToken);
    if (!st) {
      return jsonError(c, "invalid_request", "Invalid or expired state");
    }
    const pending = pendingByNonce.get(st.n);
    if (!pending) {
      return jsonError(c, "invalid_request", "Unknown or replayed state");
    }
    pendingByNonce.delete(st.n);

    if (err) {
      return redirectWithError(
        pending.client_redirect_uri,
        pending.client_state,
        err,
        errDesc || err,
      );
    }
    if (!code) {
      return redirectWithError(
        pending.client_redirect_uri,
        pending.client_state,
        "server_error",
        "Missing authorization code",
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: cfg.googleClientId,
      client_secret: cfg.googleClientSecret,
      redirect_uri: googleCallbackUri,
      grant_type: "authorization_code",
      code_verifier: pending.google_code_verifier,
    });

    let tokenRes: Response;
    try {
      tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch {
      return redirectWithError(
        pending.client_redirect_uri,
        pending.client_state,
        "server_error",
        "Token endpoint unreachable",
      );
    }

    const tokenJson: unknown = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenJson || typeof tokenJson !== "object") {
      return redirectWithError(
        pending.client_redirect_uri,
        pending.client_state,
        "server_error",
        "Google token exchange failed",
      );
    }
    const t = tokenJson as Record<string, unknown>;
    const access = typeof t.access_token === "string" ? t.access_token : "";
    const refresh = typeof t.refresh_token === "string" ? t.refresh_token : "";
    const expires_in = typeof t.expires_in === "number" ? t.expires_in : 3600;
    const token_type = typeof t.token_type === "string" ? t.token_type : "Bearer";
    const scopeOut = typeof t.scope === "string" ? t.scope : pending.scope;
    if (!access) {
      return redirectWithError(
        pending.client_redirect_uri,
        pending.client_state,
        "server_error",
        "Invalid token response",
      );
    }

    const opaque = randomBytes(32).toString("base64url");
    issuedByCode.set(opaque, {
      client_code_challenge: pending.client_code_challenge,
      dcr_client_id: pending.dcr_client_id,
      client_redirect_uri: pending.client_redirect_uri,
      google_access_token: access,
      google_refresh_token: refresh,
      google_expires_in: expires_in,
      google_token_type: token_type,
      google_scope: scopeOut,
    });

    const out = new URL(pending.client_redirect_uri);
    out.searchParams.set("code", opaque);
    out.searchParams.set("state", pending.client_state);
    return c.redirect(out.toString(), 302);
  });

  app.post("/oauth/token", async (c) => {
    const raw: Record<string, string> = {};
    try {
      const parsed = await c.req.parseBody();
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") raw[k] = v;
        }
      }
    } catch {
      return jsonError(c, "invalid_request", "Invalid form body");
    }

    const grant_type = raw.grant_type;
    if (grant_type !== "authorization_code") {
      return jsonError(c, "unsupported_grant_type", "Only authorization_code is supported");
    }
    const code = raw.code;
    const redirect_uri = raw.redirect_uri;
    const client_id = raw.client_id;
    const code_verifier = raw.code_verifier;
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return jsonError(
        c,
        "invalid_request",
        "Missing code, redirect_uri, client_id, or code_verifier",
      );
    }

    const rec = issuedByCode.get(code);
    if (!rec) {
      return jsonError(c, "invalid_grant", "Unknown or expired code");
    }

    if (rec.dcr_client_id !== client_id) {
      return jsonError(c, "invalid_grant", "client_id mismatch");
    }
    if (rec.client_redirect_uri !== redirect_uri) {
      return jsonError(c, "invalid_grant", "redirect_uri mismatch");
    }
    if (pkceS256Challenge(code_verifier) !== rec.client_code_challenge) {
      return jsonError(c, "invalid_grant", "PKCE verification failed");
    }

    issuedByCode.delete(code);

    const payload: Record<string, unknown> = {
      access_token: rec.google_access_token,
      token_type: rec.google_token_type,
      expires_in: rec.google_expires_in,
      scope: rec.google_scope,
    };
    if (rec.google_refresh_token) {
      payload.refresh_token = rec.google_refresh_token;
    }
    return c.json(payload);
  });
}
