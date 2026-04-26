# TOK-20 — S1.3 OAuth discovery endpoint

## Goal

`GET /.well-known/oauth-authorization-server` returns **RFC 8414–style** OAuth 2.0 authorization server metadata (F-05), built from the deployment’s public issuer URL. No auth required.

## Design

- **`src/oauth/authorization-server-metadata.ts`** — `normalizeIssuerBaseUrl`, `buildAuthorizationServerMetadata(issuerBaseUrl)` producing JSON with required fields: `issuer`, `authorization_endpoint`, `token_endpoint`, `response_types_supported`, plus PKCE (`code_challenge_methods_supported: ["S256"]`), `grant_types_supported`, `scopes_supported` (includes `drive.file`), `token_endpoint_auth_methods_supported`, and `registration_endpoint` for the upcoming DCR/CIMD story (TOK-21).
- **Issuer resolution** — `parseBootEnv()` adds `publicIssuerOrigin` from optional `PUBLIC_ISSUER_URL`, else `http://127.0.0.1:${PORT}` (default `PORT=3000`). Invalid URL fails boot with a single-line pointer to `env.example`.
- **`createApp({ oauthIssuerBaseUrl })`** — `index.ts` passes `boot.value.publicIssuerOrigin`. When omitted (unit tests), defaults to `DEFAULT_OAUTH_ISSUER_BASE_URL` in the oauth module.
- **Latency** — handler returns precomputed JSON shape (no I/O); p95 SLO is satisfied in-process; contract test samples `app.request` latencies.

## Out of scope

Working `/oauth/authorize`, `/oauth/token`, or `/oauth/register` handlers (TOK-21+).
