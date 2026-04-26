# Runbook: `oauth.refresh_failure`

## Trigger

Cloud Monitoring or Sentry shows **OAuth token refresh failure rate > 1%** over 15 minutes (`docs/observability.md`).

## First checks

1. **Cloud Logging** — filter `path` for OAuth token routes and `outcome` / `status` for 4xx/5xx spikes.
2. **Google Cloud Console** — OAuth client still valid; consent screen not in error state.
3. **Secrets** — `GOOGLE_CLIENT_SECRET`, refresh-token encryption key, and `SESSION_SECRET` unchanged and mounted on the revision (`docs/environments.md`).

## Likely causes

- Rotated client secret not updated in Secret Manager / Cloud Run.
- User revokes grant en masse (expected transient spike).
- Clock skew or PKCE regression in a bad deploy.

## Mitigation

- Fix misconfigured secret or redeploy last good revision.
- If code regression, roll forward with fix after repro in staging.

## Rollback

Digest-based rollback to prior Cloud Run revision; no schema migration.
