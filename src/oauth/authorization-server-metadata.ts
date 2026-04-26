/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) for this connector.
 * Endpoints are paths on the same issuer origin; real handlers land in later stories (TOK-21+).
 */

/** Default used by `createApp()` when no issuer is passed (tests / local smoke). */
export const DEFAULT_OAUTH_ISSUER_BASE_URL = "http://127.0.0.1:3000";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * Normalizes the issuer URL (RFC 8414: issuer identifier is case-sensitive URL string).
 * Trims input and strips a trailing slash for stable equality.
 */
export function normalizeIssuerBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new TypeError("issuer base URL must be non-empty");
  }
  const u = new URL(trimmed);
  return u.href.replace(/\/+$/, "");
}

function absolutePath(issuer: string, path: string): string {
  return new URL(path, `${issuer}/`).href;
}

/**
 * Builds the JSON object served at `/.well-known/oauth-authorization-server`.
 */
export function buildAuthorizationServerMetadata(issuerBaseUrl: string): Record<string, unknown> {
  const issuer = normalizeIssuerBaseUrl(issuerBaseUrl);

  return {
    issuer,
    authorization_endpoint: absolutePath(issuer, "/oauth/authorize"),
    token_endpoint: absolutePath(issuer, "/oauth/token"),
    registration_endpoint: absolutePath(issuer, "/oauth/register"),
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "email", "profile", DRIVE_FILE_SCOPE],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
  };
}
