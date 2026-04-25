---
title: Project Constitution — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: ratified
date: 2026-04
---

## Mission

Provide a self-hosted remote MCP server and matching Cowork/Claude plugin that gives users reliable, least-privilege Google Drive access across every Claude surface, where Anthropic's bundled connector currently fails. Be the calmest, most boring piece of infrastructure in the user's stack: it just works, every time, and never surprises you with what it can see.

## Principles (numbered, declarative)

1. **Per-user OAuth, never service accounts.** Every Drive call is made on behalf of a specific user with their own grant. Service-account fallbacks are not allowed in v1.
2. **Least-privilege scopes by default.** `drive.file` is the default scope. `drive.readonly` and `drive` are opt-in, documented, and gated behind explicit operator decisions.
3. **Per-session token isolation.** A user's tokens never reach another user's session. Storage keys are namespaced by hashed user/session id.
4. **Standards over shortcuts.** Implement the MCP specification (Streamable HTTP, OAuth 2.0 with PKCE, DCR/CIMD, `/.well-known/oauth-authorization-server`) by the book. No custom transport, no custom auth handshake.
5. **Treat Drive content as untrusted input.** Files may carry indirect prompt injection. Destructive operations require explicit user intent. Tool annotations (`readOnlyHint`, `destructiveHint`) are mandatory.
6. **Latency budgets are real.** Tool round-trip target ≤ 3 s. We measure, log, and act on tail latency.
7. **Self-hostable is the deployment contract.** Cloud Run, Cloudflare Workers, and VPS/Docker are first-class targets. The reference deployment is documented and reproducible.
8. **Test before declaring done.** Every story ships with targeted tests, and the `verify-completion-promise` hook is the only path to `STORY_COMPLETE`.
9. **Specs, designs, and decisions live in `docs/`.** Code without a spec is not a feature; a feature without acceptance criteria is not in scope.
10. **The diary records intent, not noise.** End-of-session/workflow summaries and significant decisions only.

## Non-negotiables (security, privacy, compliance)

- No credentials, access tokens, refresh tokens, OAuth codes, or user-identifying secrets in logs, ever.
- Refresh tokens encrypted at rest with AES-256-GCM. Encryption keys live in a secret manager, not the repo, not the container image.
- No telemetry that exfiltrates Drive content or filenames.
- OAuth consent screen describes Drive access truthfully, in plain language.
- Vulnerability disclosure path documented in the README before v1 ship.

## Definition of Done (project level)

A piece of work is Done when:

1. A spec or design doc exists under `docs/` (PRD, architecture, story design, or test plan).
2. Targeted tests for the story exist and are listed in `docs/tests/<story-id>-targets.txt`.
3. Implementation passes those targeted tests **and** lint, typecheck, and unit suites.
4. Reviewer (Rev) has signed off on the PR.
5. The diary has a session/decision entry if a foundational doc or architectural decision changed.
6. Linear story is moved to Done with a link to the PR.

## Amendment Process

Constitution changes are proposed as a PR that edits this file, accompanied by a short rationale in the PR description. Amendments require Architect approval and are recorded as a dated entry in `docs/_onboarding-state.md` under a `## constitution-amendment` heading. The Cursor rule `01-constitution.mdc` is regenerated from this document on every amendment.
