# TOK-21 — Test plan (S1.4 DCR + PKCE)

## Scope

- RFC 7591 subset: `POST /oauth/register`.
- `GET /oauth/authorize` validation: PKCE S256 required; `redirect_uri` must match DCR registration; `https://claude.ai/api/mcp/auth_callback` allowed when registered.
- Google callback + `POST /oauth/token` authorization_code grant with PKCE verification (`fetch` to Google token endpoint mocked in unit tests).

## Suites

| Tier | File                                      | Notes                                      |
| ---- | ----------------------------------------- | ------------------------------------------ |
| Unit | `tests/unit/oauth-dcr-onboarding.test.ts` | End-to-end in-process with stubbed `fetch` |

## Regression

Existing suites that call `createApp()` without `oauth` remain unchanged (no `/oauth/*` handlers mounted).
