---
title: UX Principles — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: draft
date: 2026-04
---

## Audience

Two distinct audiences, both addressed:

- **End users in Claude surfaces** (Cowork, Claude.ai, Claude Desktop/Mobile, Claude Code). They never see our HTTP server directly; they experience us as the OAuth consent screen, the connector card in Settings, the tools the model calls, and any error messages bubbled up by Claude.
- **Operators self-hosting the server.** They experience the README, the deployment scripts, the Cloud Run / Workers configuration UX, and the logs.

We design for both, separately.

## Voice & tone

- **Quiet competence.** The connector should feel like part of Claude, not a third-party add-on. No emoji, no marketing voice, no exclamation marks in error strings.
- **Specific over generic.** "Authorization expired — please reconnect Google Drive" beats "Something went wrong".
- **Plain English for consent.** OAuth consent strings describe what Drive access is being granted in language a non-developer understands.

## Interaction principles

1. **First-run is < 10 minutes, end-to-end.** Plugin install → consent → first successful tool call. Anything that adds friction on first run must justify itself loudly.
2. **Refresh is invisible.** Token refresh after access-token expiry must not surface to the user. If refresh fails, the next tool call surfaces a single, clear "please reconnect" message.
3. **Latency tolerance: 3 s typical, 10 s hard ceiling.** Beyond 3 s the model's UX degrades; beyond 10 s users give up. We log p50/p95/p99 and treat regressions as bugs.
4. **Destructive actions require evidence of intent.** `share_file`, `move_file`, large `update_file` payloads — the model is expected to confirm with the user before calling. Tool annotations carry `destructiveHint: true` so Claude surfaces handle them appropriately.
5. **Per-surface awareness.** Cowork shows tool results inline; Claude Code shows them in the terminal pane; mobile may truncate. Tool result formatting (text first, optional structured payloads) targets the lowest-common-denominator surface.
6. **Accessibility:** all human-facing strings are screen-reader friendly. We do not rely on color alone in any operator-facing log dashboard.

## Error & empty states

- **Auth errors:** single-line, actionable, link to the connector card. Never echo OAuth error codes verbatim to the user.
- **Drive 404 / permission denied:** "I can't see that file with your current access — it may not be shared with this Drive scope." Include the file id only if it was provided by the user.
- **Drive transient errors:** retry silently with exponential backoff (NF-05); only surface the failure if all retries exhaust.
- **Empty results:** "No files matched. Try …" with one example query refinement, not a wall of suggestions.
- **Tool list empty (the original Anthropic-connector failure mode we are replacing):** treat this as an alarmable bug, not a UX state. Health check that `tools/list` returns ≥ 6 tools after auth.

## Success criteria

UX is successful when:

1. A first-time user can install, consent, and run a successful `search_files` in under 10 minutes without reading the README.
2. After 30 days of use, no user has been re-prompted to authorize unless they explicitly disconnected.
3. ≥ 95% of `tools/list` responses immediately after `oauth complete` return the full tool set on first call.
4. Operator README compiles to a working Cloud Run deployment in under 30 minutes.
5. No production log entry contains a token, code, or refresh-token value (audited weekly).
