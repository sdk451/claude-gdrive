---
title: Design System — Google Drive Cowork Connector
project: gdrive-cowork-connector
status: not-applicable-v1
date: 2026-04
---

## Applicability

**v1 has no first-party UI surface.** The connector is consumed via Claude surfaces (Cowork, Claude.ai, Claude Desktop/Mobile, Claude Code) and via OAuth consent screens hosted by Google. The Cowork plugin wrapper is file-only (`plugin.json`, `.mcp.json`, skills, slash commands, README) — no rendered components are owned by this project.

For that reason, this project does not ship a token system, a component library, or a Storybook in v1. The Cursor rule `05-design-system.mdc` references this file, and the rule is scoped to `components/**` and `**/*.tsx` so it stays inert until UI code actually lands.

## Surfaces we do influence

### OAuth consent screen (Google-hosted)

- Owner: the GCP OAuth client configuration.
- Owned strings: app name, support email, scope descriptions, privacy policy and terms-of-service URLs.
- Style: short, plain-English scope explanations. No marketing copy. Links resolve to the operator's privacy/ToS or the project repo for the reference deployment.

### MCP tool descriptions and result formatting

- Owner: the tool registry in the MCP server.
- Style: tool `description` strings are written for the model, not for end users. They state "what this tool does" and "when to call it" in 1–2 sentences.
- Tool result formatting prefers plain text first; structured payloads are added as a secondary content item only where the surface benefits.

### Plugin README and slash-command docs

- Owner: this repo.
- Style: terse, screen-reader friendly, headings hierarchy enforced. Code blocks are copy-paste runnable. No badges that depend on third-party uptime.

## v2 trigger

A real design system (tokens + primitives + Storybook + visual regression) becomes mandatory if any of these ship:

- A web admin UI for self-hosted operators.
- A landing site or marketing pages we own.
- Any rendered component embedded in Claude surfaces.

When the trigger fires, this file becomes a real design-system document modeled on the kit's UX addendum (DTCG tokens, shadcn/ui + Base UI primitives, Storybook with addon-a11y, Playwright `toHaveScreenshot()` baselines). Until then, this file stays intentionally short.
