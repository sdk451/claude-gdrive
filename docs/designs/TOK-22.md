# TOK-22 — S1.5 Token refresh

## Goal

Access-token refresh is automatic and silent (F-08). Refresh tokens meet NF-03 at rest.

## Approach

1. **Opaque refresh handle** — After `authorization_code` exchange at `POST /oauth/token`, the connector returns an opaque `refresh_token` string (prefix `ref_`) instead of the raw Google refresh token. The raw value is never sent to the MCP client.

2. **AES-256-GCM at rest** — Google refresh material is encrypted with AES-256-GCM before being stored in the in-process `refreshSessions` map. The 32-byte key is derived from `SESSION_SECRET` hex (same boot secret as OAuth state signing; production uses secret manager for this value).

3. **`grant_type=refresh_token`** — `POST /oauth/token` accepts `refresh_token` (opaque handle) + `client_id`, decrypts, calls `https://oauth2.googleapis.com/token` with Google’s refresh grant, returns new `access_token` / `expires_in` and the same opaque handle (or updates ciphertext if Google rotates refresh).

4. **Re-auth signal** — If Google rejects refresh (`invalid_grant`, network parse failure, etc.), respond with OAuth-style `error` / `error_description` plus `reauth_required: true` so clients can restart `authorization_code` without guessing.

## Out of scope

- Redis-backed refresh persistence (Epic 1 in-memory only; encryption format is stable for a future store).
- Proactive refresh before expiry inside MCP tool handlers (separate story once Drive calls land).

## Verification

Targeted tests in `docs/tests/TOK-22-targets.txt`; full `pnpm test` + typecheck + lint.
