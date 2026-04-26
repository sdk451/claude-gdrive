# TOK-22 — Test plan (S1.5 Token refresh)

## Cases

1. **oauth.refresh.silent_success** — After onboarding, `grant_type=refresh_token` with the opaque handle returns a new access token without user interaction (mocked Google token endpoint).

2. **Opaque refresh on code exchange** — Initial token response exposes an opaque `ref_*` handle, not the mock Google refresh string.

3. **AES round-trip** — Encrypt/decrypt helper produces identical plaintext for representative refresh strings.

4. **Refresh failure** — Google returns error JSON → `invalid_grant`, human-readable description, `reauth_required: true`.

5. **Wrong client_id on refresh** — `invalid_grant` for handle bound to another DCR client.
