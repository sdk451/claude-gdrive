# TOK-20 — Test plan (S1.3 OAuth discovery)

## Scope

- RFC 8414 JSON shape for `GET /.well-known/oauth-authorization-server`.
- Issuer resolution from `PUBLIC_ISSUER_URL` / `PORT` via `parseBootEnv`.
- In-process latency budget for the discovery route (p95 &lt; 200 ms).

## Suites

| Tier | File                                                     | Notes                              |
| ---- | -------------------------------------------------------- | ---------------------------------- |
| Unit | `tests/unit/oauth-authorization-server-metadata.test.ts` | Pure builder + normalization       |
| Unit | `tests/unit/server.test.ts`                              | HTTP contract + latency sample     |
| Unit | `tests/unit/boot-env.test.ts`                            | `publicIssuerOrigin` + invalid URL |

## Regression

Existing contract tests call `createApp()` without options; default issuer remains `http://127.0.0.1:3000`.
