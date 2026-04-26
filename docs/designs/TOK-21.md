# TOK-21 — S1.4 DCR or CIMD onboarding

## Goal

Ship **Dynamic Client Registration (DCR, RFC 7591)** for MCP clients, with **PKCE (RFC 7636) S256** enforced on the authorization-code path and **hosted Claude** redirect URI support (F-06 / F-07 / F-11).

## Chosen path: DCR

- **`POST /oauth/register`** — JSON body with `redirect_uris` (required, non-empty). Each URI must be `https:` **or** `http:` on `localhost` / `127.0.0.1`. Returns `client_id` (UUID) and metadata for a **public** client (`token_endpoint_auth_method: none`).
- **`GET /oauth/authorize`** — Validates `client_id` exists, `redirect_uri` ∈ registered URIs, `response_type=code`, **`code_challenge` + `code_challenge_method=S256` required**, forwards to Google’s authorize URL using the server’s `GOOGLE_CLIENT_ID`, with `redirect_uri` set to this deployment’s **`/oauth/google/callback`**. Signed **state** carries PKCE challenge, DCR client id, client `redirect_uri`, client `state`, and `scope` (HMAC-SHA256 using `SESSION_SECRET` bytes).
- **`GET /oauth/google/callback`** — Verifies state, exchanges Google auth `code` at `https://oauth2.googleapis.com/token` (with `code_verifier` from Google leg — same PKCE verifier forwarded), issues an **opaque** connector auth `code`, stores `{ code_challenge }` for PKCE check at token time plus returned Google tokens for the token response.
- **`POST /oauth/token`** — `grant_type=authorization_code` with `code`, `redirect_uri`, `client_id`, **`code_verifier`** (required). Verifies `S256(code_verifier)` matches stored challenge; returns Google access + refresh token JSON (no token material in logs).

## Alternative: CIMD (documented only)

**Client ID Metadata Documents (RFC 7592)** are a good fit when the operator publishes static client metadata at a well-known URL instead of calling `register`. We are **not** implementing CIMD in this story; operators can add a static metadata URL later and map it to the same authorize/token pipeline if needed.

## Out of scope

- Refresh-token rotation, encryption at rest, Redis session store (TOK-22+).
- Revoking DCR registrations.
