$ErrorActionPreference = 'Stop'
$rulesDir = Join-Path $PSScriptRoot '.cursor\rules'
# If not saving as a .ps1 file, use: $rulesDir = Join-Path (Get-Location) '.cursor\rules'
New-Item -ItemType Directory -Force -Path $rulesDir | Out-Null

Set-Content -LiteralPath (Join-Path $rulesDir '00-index.mdc') -Encoding utf8 -Value @'
---
alwaysApply: true
description: Rules index
---
# Rules index
- 01-constitution.mdc — always on
- 02-architecture.mdc — always on
- 03-tech-stack.mdc — always on
- 04-infra.mdc — scoped to infra/
- 05-design-system.mdc — scoped to components/
- 10-testing.mdc — scoped to tests/
- 20-planner.mdc / 21-implementer.mdc / 22-reviewer.mdc — persona-gated
- 40-serena.mdc — always on; prefer Serena for code navigation
- 41-memory.mdc — always on; consult and update session memory
- 30-personal.mdc — gitignored
Keep total always-on content under ~2,000 tokens.
'@

Set-Content -LiteralPath (Join-Path $rulesDir '40-serena.mdc') -Encoding utf8 -Value @'
---
description: Use Serena for codebase navigation
alwaysApply: true
---
# Use Serena for codebase understanding
For any task requiring understanding of the codebase structure, PREFER Serena's
symbol-level tools (find_symbol, find_referencing_symbols, insert_after_symbol,
replace_symbol_body) over plain file reads and text search.
Only fall back to Read/Grep when:
- The file is under ~100 lines
- You need to see a non-code file (JSON, YAML, markdown)
- Serena's language server does not cover the language
'@

if ($env:MEMPALACE) {
  Set-Content -LiteralPath (Join-Path $rulesDir '41-memory.mdc') -Encoding utf8 -Value @'
---
description: Consult and update MemPalace
alwaysApply: true
---
# Memory via MemPalace
BEFORE responding about any person, project, or past event:
- Call mempalace_kg_query or mempalace_search FIRST.
- Never guess from training data — verify.

AT the start of your turn:
- Call mempalace_write_diary with agent={persona-name}, entry="STARTED: <summary>"

AT the end of your turn:
- Call mempalace_write_diary with agent={persona-name},
  entry="COMPLETED: <outcome>, outputs: <paths>, next: <handoff>"

IF blocked mid-turn:
- Call mempalace_write_diary with agent={persona-name},
  entry="BLOCKED: <why>, need: <resolver>"
'@
} else {
  Set-Content -LiteralPath (Join-Path $rulesDir '41-memory.mdc') -Encoding utf8 -Value @'
---
description: Consult and update mcp-memory-service
alwaysApply: true
---
# Memory via mcp-memory-service
BEFORE responding about any person, project, or past event:
- Call memory_search FIRST.
- Never guess from training data — verify.

AT the end of your turn, store the session summary:
- Call memory_store_session with tags=["agent:{persona-name}", "story:{story-id}"],
  content="<what-happened, outputs, next-handoff>"

IF blocked mid-turn, store a block note:
- Call memory_store with tags=["blocked", "agent:{persona-name}"],
  content="<why>, need: <resolver>"
'@
}