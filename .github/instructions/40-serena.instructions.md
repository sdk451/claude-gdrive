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
