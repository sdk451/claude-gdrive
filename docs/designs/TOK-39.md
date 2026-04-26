# TOK-39 — Design: S4.3 Operator README (P-07)

## Goal

Meet **P-07** (`docs/prd.md` §5.3): the **root `README.md`** must contain a **complete operator-facing setup guide** covering:

1. **Google OAuth client** configuration (redirect URIs for hosted Claude / Cowork vs Claude Code loopback), without duplicating the entire OAuth spec — link to `docs/architecture.md`, `docs/ux.md`, and `env.example`.
2. **Cloud Run–oriented deployment** — secrets via Secret Manager, `PUBLIC_ISSUER_URL`, build/deploy path, verification curls; defer long checklists to **`docs/environments.md`** with anchored links.
3. **Plugin / Cowork install** — bundle layout per `docs/architecture.md`, editing **`.mcp.json`** `url` to the live **`/mcp`** endpoint, ZIP / UI (P-05 reference).

## Non-goals

- Replacing `docs/environments.md` (remains canonical for bootstrap tables, WIF, Redis).
- Changing application code or CI workflows.

## Acceptance

- README gains a clearly titled operator section (stable heading for contract tests).
- `docs/tests/S4.3-targets.txt` lists a single Vitest file that asserts required keywords and deep links into `docs/environments.md`.
