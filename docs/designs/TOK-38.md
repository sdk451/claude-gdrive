# TOK-38 — Design: S4.2 Skills (+ optional slash commands)

## Goal

Meet **P-03** (`docs/prd.md` §5.3): ship **at least one** plugin skill that explains **Google Drive `files.list` search query syntax** (`q`), aligned with the MCP tool **`search_files`** and the bundle layout in `docs/architecture.md` (`skills/gdrive-usage.md`).

## Deliverable

- **`skills/gdrive-usage.md`** — user-facing cheat sheet: operators (`and` / `or` / `not`), common fields (`name`, `mimeType`, `fullText`, parents, trash), escaping quotes, and a canonical link to Google’s **Search for files and folders** guide.

## P-04 (slash commands)

**Optional in v1** per Linear — **no `commands/` tree** in this change; future story can add `/gdrive:*` stubs if product wants them.

## Acceptance

- Skill file present and referenced by unit tests for required phrases + doc URL.
- `docs/tests/S4.2-targets.txt` lists the manifest skill test file only.
