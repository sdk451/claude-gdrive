---
title: Project Brief — Google Drive Cowork Connector
project: gdrive-cowork-connector
date: 2026-04
status: draft
sources:
  - docs/_seed/requirements-brief.md
  - docs/prd.md
---

# Project Brief: Google Drive Cowork Connector

## 1. Problem

Anthropic's bundled Google Drive connector (`drivemcp.googleapis.com`) is reproducibly broken across Cowork and Claude Code surfaces: it shows as **Connected** in Settings, lists no tools to the model, and leaves users without a working Drive integration even though Gmail and Calendar from the same Google Workspace integration work fine. The failure persists across reconnects and across macOS and Windows. Multiple unresolved GitHub issues confirm it is widespread and ongoing as of April 2026 (`anthropics/claude-code` #32450, #39062, #39422).

People who depend on Drive in their Cowork workflow currently cope by copy-pasting content out of Drive and back in by hand, or by routing around Cowork entirely for Drive-heavy work — defeating the purpose of having a connector.

## 2. Vision & Goals

Provide a **self-hosted remote MCP server** plus an installable **Cowork/Claude plugin** that delivers reliable Google Drive access across all Claude surfaces (claude.ai, Cowork, Claude Desktop, Claude Code, Claude Mobile), under the user's own Google Cloud project, with least-privilege scopes by default.

Specific goals:

1. Replace the broken first-party connector with a working alternative usable end-to-end in a single Cowork session (search → read → create).
2. Plugin install + OAuth complete in **under 10 minutes** by a non-developer.
3. Correct MCP protocol implementation (Streamable HTTP transport, OAuth 2.0 with PKCE and DCR/CIMD) so it works across all Claude surfaces without per-surface hacks.
4. Tool surface that is a superset of Google's official 7-tool set, addressing known gaps: folder listing, file moving, permission management.
5. Operate at least as well as the bundled connector on the dimensions that matter (latency, refresh, error handling), and noticeably better on reliability (no zero-tools-after-connect mode).

## 3. Non-Goals

- Not a replacement for or a fix to Anthropic's official connector — independent alternative.
- Not a multi-tenant SaaS — designed for personal, team, or enterprise self-hosting.
- Google Workspace Admin APIs (audit logs, user management) are out of scope.
- Google Workspace Chat, Meet, and Forms are out of scope for v1.
- Shared Drives / Team Drives, Sheets cell-level operations, Docs surgical editing, and Drive change webhooks are v2+.

## 4. Primary Users & Use Cases

**Cowork user on Pro plan** — wants Drive search/read/create available immediately after installing the plugin and connecting their Google account, with no manual token configuration.

**Team plan owner / IT** — wants to self-host the MCP server under their own GCP project so the connector runs under their company's data policies, and to distribute the plugin to team members who each authenticate with their own Google account.

**Developer extending the kit** — wants a small, well-documented TypeScript codebase where adding a new Drive tool is a tens-of-lines change and where MCP protocol details are abstracted by the official SDK.

## 5. Key Functional Capabilities (high level)

- Implement MCP Streamable HTTP transport (`POST/GET/DELETE /mcp`) with correct `mcp-session-id` semantics.
- OAuth: `/.well-known/oauth-authorization-server` discovery, DCR or CIMD onboarding, PKCE, automatic refresh.
- Per-user token isolation; refresh tokens encrypted at rest (AES-256-GCM); no credentials in logs.
- Tools: `search_files`, `read_file_content`, `download_file_content`, `get_file_metadata`, `get_file_permissions`, `create_file` (Must); `update_file`, `move_file`, `share_file`, `list_folder` (Should).
- Plugin wrapper: `.claude-plugin/plugin.json`, `.mcp.json`, at least one skill file, optional slash commands, README with full setup guide, installable via Cowork plugin UI (zip / GitHub).

## 6. Constraints & Dependencies

- Anthropic Pro/Max/Team/Enterprise plan required to add a custom connector.
- Server must be reachable from Anthropic egress (`160.79.104.0/21`) — VPN-only is not viable.
- Hosted Claude callback `https://claude.ai/api/mcp/auth_callback` must be an authorized redirect URI in the GCP OAuth client.
- Claude Code uses loopback callbacks (`http://localhost/callback`, `http://127.0.0.1/callback`) declared in client metadata.
- Users requesting `drive.readonly` / `drive` for external audiences must clear Google's OAuth verification; internal-only Workspaces can bypass it.
- Runtime constraint: Node.js 22 LTS on Linux (amd64/arm64).

## 7. Success Metrics

**Primary metric:** Time-to-first-successful-tool-call from a fresh Cowork user (plugin install → OAuth complete → `search_files` returns) — target **≤ 10 minutes**.

**Secondary metrics:**

- Tool round-trip latency (MCP → Drive → MCP) under **3 seconds** for typical operations.
- Silent token refresh success rate **≥ 99%** over a 30-day window.
- Zero credential or token strings observed in production logs (audited).
- ≥ 95% of `tools/list` responses return the full advertised tool set on first call after auth.

## 8. Risks (top 5)

1. **OAuth complexity across surfaces.** Hosted Claude vs Claude Code use different callback patterns; getting both right requires careful discovery + DCR/CIMD handling. _Mitigation:_ implement against MCP authorization spec (2025-03-26) end-to-end; validate with MCP Inspector and against both surfaces before declaring done.
2. **Indirect prompt injection from Drive content.** Drive files are user-untrusted input; malicious content could attempt to steer the model. _Mitigation:_ treat all Drive content as untrusted, require explicit confirmation on destructive ops, follow Google's published guidance on Drive MCP injection.
3. **Google scope verification.** Apps requesting `drive.readonly`/`drive` for external audiences require Google verification. _Mitigation:_ default to `drive.file`; document scope step-up clearly; provide internal-only Workspace path that bypasses verification.
4. **First-party connector unfixes itself.** If Anthropic ships a fix, demand drops. _Mitigation:_ lean into self-hosting / privacy / scope-control benefits that the bundled connector does not provide; design tool surface as superset.
5. **Refresh-token storage compromise.** Persistent refresh tokens are durable credentials. _Mitigation:_ encrypt at rest with AES-256-GCM, rotate session keys, never log token material, support short TTLs.

## 9. Open Questions

- Which deployment shape (Cloud Run vs Cloudflare Workers vs VPS+Docker) is the canonical first-class target for v1 docs/CI? Default assumption: Cloud Run.
- Single-region or multi-region? (Latency vs operational complexity.)
- Do we ship a hosted reference instance for evaluators, or strictly self-host?
- Slash commands (`/gdrive:search`, etc.) for v1 or v1.1?
- DCR vs CIMD as the default OAuth onboarding path — pick one for v1, document the other as alternative.

## 10. References

- `docs/_seed/requirements-brief.md`, `docs/prd.md`, `docs/architecture.md`, `docs/tech-stack.md`
- [Anthropic — Building custom connectors via remote MCP servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Anthropic — Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [MCP Authorization spec (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- [Google Drive API v3](https://developers.google.com/workspace/drive/api/reference/rest/v3)
- Known issues: [#39062](https://github.com/anthropics/claude-code/issues/39062), [#39422](https://github.com/anthropics/claude-code/issues/39422), [#32450](https://github.com/anthropics/claude-code/issues/32450)

## Reconciliation with PRD

`docs/prd.md` is authoritative on functional and non-functional requirements (`F-*`, `NF-*`, `P-*` IDs), acceptance criteria, and the requirements tables. This brief is authoritative on intent, motivation, success metrics, and top risks. Where the brief and PRD differ on rounded numbers (e.g., latency target of 3 s, install target of 10 min), the brief states the user-visible commitment and the PRD states the engineering bound; both are aligned.
