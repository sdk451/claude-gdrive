# Memory, Codebase Context, and Auto-Diarising

**Companion to** `autonomous-swe-design.md`, `autonomous-swe-design-ux-addendum.md`, and `IMPLEMENTATION-GUIDE.md`. This document replaces the brief treatment of memory/context in the main design with a careful review of the options, a concrete recommendation, and setup instructions.

Three separate problems often get conflated. Treating them distinctly is the key to a workable setup.

1. **Codebase context** — *"What does the code look like right now, and how do its pieces relate?"* This is a symbol-level question: classes, functions, call graphs, types, references. Wanting to rename one symbol across 50 files is a codebase-context problem.
2. **Session memory** — *"What did we discuss, decide, or discover across conversations?"* This is about preserving reasoning, preferences, and project history so a new agent session doesn't start from zero.
3. **Auto-diarising** — *"What actually happened, agent by agent, turn by turn, without me having to ask?"* A timestamped record of the work, captured automatically.

Each problem has different best-fit tools. Trying to solve all three with one tool is why most setups feel inadequate.

---

## 1. The Current Approach (Critique)

The user's current approach is mempalace alone. That's a reasonable starting point, but it has three limitations:

- **MemPalace is session-memory-first, not codebase-context-first.** It stores conversation verbatim and retrieves semantically. It doesn't understand symbols, doesn't follow references, doesn't know that `getUser` in one file depends on `UserRepository` in another. When agents need to "understand the codebase," MemPalace gives them recall of *what was said about the codebase*, not a model of the codebase itself.
- **MemPalace's headline claims are load-bearing on ChromaDB, not the Palace architecture.** An independent analysis (lhl/agentic-memory) found that the 96.6% recall@5 on LongMemEval is essentially a ChromaDB-plus-default-embeddings baseline — the "Wings / Rooms / Halls" structure exists as metadata strings but isn't active in retrieval ranking. The AAAK compression can actually *reduce* accuracy. The system is good; the marketing over-reaches.
- **The MemPalace project is new and moving fast.** Created April 5 2026. Python API signatures still changing. Two-week-old releases. Fine for experimentation, premature to bet a production workflow on it alone.

None of that means drop MemPalace. It does mean pair it with a codebase-context tool and treat its auto-diarising feature as the feature-of-interest rather than as a generic memory solution.

---

## 2. Option Survey

### 2.1 Codebase-context tools

| Tool | Approach | License | Works with |
|---|---|---|---|
| **Serena** (`oraios/serena`) | LSP-backed symbol-level navigation across 30+ languages; IDE-grade retrieval and editing for agents; includes a memory system for long-lived workflows | Free, MIT/Apache via MCP | Cursor, Claude Code, Cline, VS Code, Windsurf |
| ByteRover CLI (formerly Cipher) (`campfirein/cipher`) | Memory-layer for coding agents with System 1 / System 2 / Workspace memory; more memory-focused than code-structure-focused | Open source CLI, paid hosted tier | Cursor, Windsurf, Claude Code, Claude Desktop, Gemini CLI, VS Code, Roo |
| Built-in Cursor indexing | Repo-wide codebase indexing that powers @-references and chat grounding | Included in Cursor | Cursor only |
| SoulForge's "Soul Map" | AST-parsed, PageRank-ranked dependency graph, rebuilt after every edit | Early-stage, less proven | Its own agent, integrations emerging |

**Verdict: Serena.** It's the mature, battle-tested, widely-integrated tool for what the current setup is missing. It speaks MCP, so Cursor gets it directly, no Claude Code required. It understands symbols because it's powered by real Language Server Protocol — not heuristics or embeddings. It adds symbol-level editing tools that are dramatically more reliable than text search-and-replace, which is a quiet killer of agent quality in larger codebases.

### 2.2 Session-memory tools

| Tool | Approach | License | Notes |
|---|---|---|---|
| **MemPalace** (`MemPalace/mempalace`) | Verbatim storage, MCP-native, spatial organisation (wings/rooms/halls), per-agent diary tools, Claude Code hooks for periodic saves | Free, MIT, local-first, no API keys required | Official domain: `mempalaceofficial.com`. `mempalace.tech` is an impostor and flagged as malware risk |
| **Mem0 / OpenMemory** (`mem0ai/mem0`) | Semantic + keyword + entity hybrid search with automatic memory updates; has an "OpenMemory" MCP flavor tuned for coding agents | Open-core (Mem0) + hosted tier | Default tuned to OpenAI but swappable; cloud or self-hosted |
| **mcp-memory-service** (`doobidoo/mcp-memory-service`) | 100% local, knowledge graph with typed edges, auto-consolidation (decay + compression), hybrid BM25 + vector search, REST + MCP | Free, Apache 2.0 | The most "just works" production-shaped option if self-host is preferred |
| **ByteRover / Cipher** (as above) | Memory-layer for coding agents, 3-tier memory model, team-shared workspace | Open source CLI (`brv`), paid hosted tier for team features | Pairs with any MCP tool |
| **Pensyve** (Anthropic plugin) | Entity-aware recall with lifecycle hooks, 2 agents, 6 hooks, 4 skills | Anthropic Claude Code plugin | Claude Code only, not portable |

**Verdict: MemPalace for the diary-first angle, with mcp-memory-service as the serious fallback.** Keep MemPalace because it solves the user's explicit auto-diarising requirement without extra plumbing. Add mcp-memory-service if and when MemPalace's API churn causes friction — it's more mature, 100% local, and has a proper knowledge graph. They can coexist since both are MCP; they show up as separate servers to the agent.

### 2.3 Auto-diarising

Only MemPalace has this as a first-class feature. The `mempalace_write_diary` and `mempalace_read_diary` MCP tools give each agent its own timestamped diary. Combined with hooks that periodically save and save-before-context-compression, you get a running journal without anyone typing "please remember this."

For any other memory stack, you fake it with a SessionStart/Stop hook that appends to a markdown file. A 10-line bash hook is sufficient. Details in §5.

---

## 3. Recommendation

**Combine three tools, each doing one job:**

1. **Serena** — codebase context. Symbol-level understanding. Installed as an MCP server. Used by every agent that reads or edits code.
2. **MemPalace** — session memory and auto-diarising. Installed as an MCP server. Per-project palace, one diary per persona (Analyst, Architect, Planner, Implementer, Reviewer, UX Engineer, Platform Engineer, Test Architect).
3. **A custom `diary-append` hook** — belt-and-braces layer that logs agent transitions to `docs/diary/{YYYY-MM}/` markdown files regardless of which memory tool is in vogue. This means the diary lives in your repo, survives any tool churn, and is greppable by agents without going through MCP.

That's it. Three tools, three clean jobs. Skip Cipher/ByteRover (adds a paid dependency for features MemPalace covers). Skip Mem0's OpenMemory for now (you can add it later if MemPalace proves insufficient — both are MCP, so additive).

---

## 4. Setup — Serena

Works natively in Cursor and Claude Code; no switching cost. Install once per machine.

### 4.1 Install the Serena MCP server

```bash
# Serena recommends NOT installing via marketplaces — they ship outdated versions
# Use the maintainer's official quick-start:

# Option A — uvx run-on-demand (simplest)
# (No install step; we register the command below and uvx fetches fresh each run)

# Option B — clone and self-host
git clone https://github.com/oraios/serena.git ~/.serena
cd ~/.serena
uv sync
```

### 4.2 Register with Cursor

Settings → MCP → Add MCP server → paste (adjust path to your clone):
```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"]
    }
  }
}
```

Restart Cursor. Confirm via Settings → MCP that `serena` shows green.

### 4.3 Register with Claude Code (if using)

```bash
claude mcp add serena -- uvx --from "git+https://github.com/oraios/serena" serena start-mcp-server
claude mcp list   # confirm 'serena' is connected
```

### 4.4 Activate per project

Inside your repo, on first run, Serena indexes the workspace. You can nudge agents to use it with a rule:

```bash
cat > .cursor/rules/40-serena.mdc <<'EOF'
---
description: Use Serena for codebase navigation
alwaysApply: true
---
# Use Serena for codebase understanding

For any task requiring understanding of the codebase structure, prefer Serena's
symbol-level tools (`find_symbol`, `find_referencing_symbols`, 
`insert_after_symbol`, `replace_symbol_body`) over plain file reads and 
text search.

Serena is faster, uses fewer tokens, and is less error-prone than 
line-number-based edits on files over ~200 lines.

Only fall back to Read/Grep when:
- The file is under ~100 lines
- You need to see a non-code file (JSON, YAML, markdown)
- Serena's language server doesn't cover the language
EOF
```

Commit this.

---

## 5. Setup — MemPalace

### 5.1 Install

```bash
pip install mempalace
```

Confirm:
```bash
mempalace --version   # should print a version
```

### 5.2 Initialise the palace for your project

From your repo root:
```bash
mempalace init .
# This creates .mempalace/ (a ChromaDB + metadata dir) — gitignored by default
echo ".mempalace/" >> .gitignore
```

Optional but recommended — mine your existing codebase into the palace so agents start day one with context:
```bash
mempalace mine ./src --mode project
mempalace mine ./docs --mode convos
```

### 5.3 Register with Cursor

Settings → MCP → Add MCP server:
```json
{
  "mcpServers": {
    "mempalace": {
      "command": "mempalace",
      "args": ["mcp"]
    }
  }
}
```

### 5.4 Register with Claude Code

```bash
claude mcp add mempalace -- mempalace mcp
```

### 5.5 Per-persona diary wiring

The goal: each persona writes to its own diary, tagged by persona name, so you can later read "what did the Implementer do last week" separately from "what did the Planner recommend".

In each persona file (`.claude/agents/*.md`), add a closing block that tells the persona to diarise at the start and end of its turn:

```markdown
## Diarising (automatic)
At the START of your turn, call `mempalace_write_diary` with:
  agent: "{persona-name}"
  entry: "STARTED: <one-line summary of the task>"

At the END of your turn (before exiting), call `mempalace_write_diary` with:
  agent: "{persona-name}"
  entry: "COMPLETED: <one-line outcome>, outputs: <file paths>, next: <handoff-to>"

If you hit a blocker mid-turn, write a third entry with:
  agent: "{persona-name}"
  entry: "BLOCKED: <why>, need: <what-resolves-it>"
```

This is a soft prompt, so it's only ~70%-reliable on its own. The backup is §6 below.

### 5.6 Periodic save hook (Claude Code)

If using Claude Code, add the MemPalace periodic-save hook per its docs. With Cursor-only, use the fallback in §6.

### 5.7 Caveats and how to work around them

- **Domain warning**: use `mempalaceofficial.com` for docs. `mempalace.tech` is an impostor and flagged as a malware risk.
- **API churn**: pin the version in a `requirements.txt` or `pyproject.toml` — e.g. `mempalace==X.Y.Z` — so agent runs are reproducible.
- **Marketing vs reality**: MemPalace's benchmark numbers reflect ChromaDB's quality more than the Palace architecture. Treat it as "good vector memory with built-in diarising" rather than "best-memory-system-ever".

---

## 6. Setup — the diary-append hook (tool-independent backup)

This is the belt-and-braces layer. It writes to `docs/diary/` in the repo regardless of whether MemPalace is healthy. It survives tool migrations.

### 6.1 The hook script

```bash
cat > scripts/hooks/diary-append.sh <<'EOF'
#!/bin/bash
# Appends a one-line entry to docs/diary/{YYYY-MM}/{YYYY-MM-DD}.md every time
# an agent invokes a tool. Designed as a SessionStart + PostToolUse hook.
#
# Expects hook JSON on stdin (Claude Code or Cursor format).

INPUT=$(cat)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MONTH=$(date -u +"%Y-%m")
TODAY=$(date -u +"%Y-%m-%d")
DIR="docs/diary/${MONTH}"
FILE="${DIR}/${TODAY}.md"
mkdir -p "$DIR"

# Initialise day file with header if empty
if [ ! -f "$FILE" ]; then
  echo "# Diary — $TODAY" > "$FILE"
  echo "" >> "$FILE"
fi

# Derive persona and action
PERSONA="${CLAUDE_AGENT_NAME:-${CURSOR_AGENT_NAME:-unknown}}"
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .hook_event_name // "start"')
BRANCH=$(git branch --show-current 2>/dev/null || echo "-")
STORY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)

# Detect if this is a session-start event or a tool event
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')

case "$HOOK_EVENT" in
  SessionStart)
    echo "- ${NOW} | ${PERSONA} | [start] branch=${BRANCH} story=${STORY}" >> "$FILE"
    ;;
  PostToolUse)
    # Only log meaningful tool uses, not every Read
    if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "Bash" ]]; then
      FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
      CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | head -c 80)
      SUMMARY="${FILE_PATH:-$CMD}"
      echo "- ${NOW} | ${PERSONA} | ${TOOL} | ${SUMMARY}" >> "$FILE"
    fi
    ;;
  Stop)
    echo "- ${NOW} | ${PERSONA} | [stop] branch=${BRANCH}" >> "$FILE"
    ;;
esac
exit 0
EOF
chmod +x scripts/hooks/diary-append.sh
```

### 6.2 Register in Claude Code settings

Add to `.claude/settings.json` (merge with existing):
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "./scripts/hooks/diary-append.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit|Bash", "hooks": [{ "type": "command", "command": "./scripts/hooks/diary-append.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "./scripts/hooks/diary-append.sh" }] }
    ]
  }
}
```

### 6.3 Register in Cursor

Cursor's hook format is slightly different but equivalent. Put a wrapper in `.cursor/hooks/` that shells out to the same script — see Cursor docs for the current schema (it shifts occasionally).

### 6.4 Why it's worth having

- Works without any MCP server running.
- Lives in your repo — grep-able forever.
- Survives tool swaps. If you drop MemPalace tomorrow, the diary is still there.
- Human-readable. You can skim a day in 30 seconds.

Example of what a day looks like:
```markdown
# Diary — 2026-04-20

- 2026-04-20T09:12:07Z | planner | [start] branch=feature/AUTH-142 story=AUTH-142
- 2026-04-20T09:13:44Z | planner | Write | docs/designs/AUTH-142.md
- 2026-04-20T09:14:10Z | planner | [stop] branch=feature/AUTH-142
- 2026-04-20T09:15:02Z | test-architect | [start] branch=feature/AUTH-142 story=AUTH-142
- 2026-04-20T09:16:29Z | test-architect | Write | docs/tests/AUTH-142.md
- 2026-04-20T09:16:47Z | test-architect | Write | tests/unit/auth/password-reset.test.ts
- ...
```

Weekly, you can ask any agent: "Summarise the diary in `docs/diary/2026-04/` and flag any stories that took more than 3 blocked iterations." This is essentially free retrospective fuel.

---

## 7. How the three tools play together

```
                ┌──────────── Agent (Planner, Implementer, Reviewer, …) ────────────┐
                │                                                                    │
                │   "Understand and edit the code"         "Recall past decisions"  │
                │                 │                                   │              │
                │                 ▼                                   ▼              │
                │          ┌─────────────┐                    ┌──────────────┐      │
                │          │   Serena    │                    │  MemPalace   │      │
                │          │  (LSP, MCP) │                    │   (MCP,      │      │
                │          │  symbols,   │                    │   verbatim,  │      │
                │          │  references,│                    │   per-agent  │      │
                │          │  refactors  │                    │   diary)     │      │
                │          └─────────────┘                    └──────────────┘      │
                │                                                                    │
                │   Every tool use logged via hook                                   │
                └──────────────────────────────┬─────────────────────────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │  diary-append hook  │
                                    │  writes to          │
                                    │  docs/diary/...     │
                                    └─────────────────────┘
```

- **Serena answers structural questions** about the code. An agent saying "where is `UserRepository` used?" should get an LSP-grade answer in a token-cheap format.
- **MemPalace answers history questions.** "What did the Architect decide about auth two weeks ago?" gets a verbatim-recalled snippet. Auto-diarising keeps the history current.
- **The diary hook is the paper trail.** Greppable, version-controlled, tool-independent. Lives alongside the code.

You can operate with any one tool missing. Serena missing means agents read full files (slower, more tokens). MemPalace missing means agents still have diary/ to grep. Diary missing means you rely on MemPalace queries for retro. All three healthy is best; two out of three is still functional.

---

## 8. Verification steps

After setup, you should see all of these work:

**Serena:**
```bash
# In a Cursor chat or Claude Code session:
# "Using Serena, find all references to the function `createUser`."
# Expect a list of file:line references with the containing symbol.
```

**MemPalace:**
```bash
# In a Cursor chat or Claude Code session:
# "Using mempalace, list the diary entries for the planner agent today."
# Expect the entries from the START/END of Planner turns.
```

**Diary hook:**
```bash
ls docs/diary/$(date +%Y-%m)/
# Expect today's markdown file with the latest entries tailing correctly.
```

If any of these fails, see §9.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Serena MCP shows "disconnected" in Cursor | `uvx` not in PATH, or Python not installed | Install Python 3.11+ and `uv`; restart Cursor |
| Serena returns empty for a language | That language's LSP not installed | `uvx ... serena install-lsp <language>` per Serena docs |
| MemPalace `init` hangs | ChromaDB dependency fetch failing | `pip install --upgrade chromadb pyyaml` first, then retry |
| MemPalace diary entries missing for some personas | Soft prompt not being honoured | Add the "Diarising (automatic)" block more forcefully to the persona file; rely more on the diary-append hook |
| Diary hook doesn't fire | `.claude/settings.json` not merged correctly, or script not executable | `chmod +x scripts/hooks/diary-append.sh`; `cat .claude/settings.json` to confirm registration |
| Diary includes noisy Read events | Hook filter too loose | Tighten the `case "$HOOK_EVENT"` matcher |
| Agent doesn't "remember" something recent | Hasn't been saved to MemPalace yet — only diarised | Ask the agent to run `mempalace_search` with relevant keywords, or run `mempalace mine docs/diary/` to ingest the diary |

---

## 10. Migration notes for users coming from mempalace-only

If you're on the old setup and want to adopt this doc's recommendation:

1. **Don't uninstall MemPalace.** Keep it for the diary features.
2. **Add Serena.** This alone will improve agent performance on large codebases more than anything else listed here. Most "context loss" complaints come from agents reading too many files unnecessarily — Serena fixes that.
3. **Add the `diary-append` hook.** Trivial to set up. Gives you a tool-independent paper trail.
4. **Optionally move to the new official MemPalace repo** (`MemPalace/mempalace` on GitHub, docs at `mempalaceofficial.com`). Pin the version.
5. **Leave everything else alone.** vibecop stays, BMAD-inspired discipline stays, the rest of the kit stays.

Net effect: you keep what works, plug the symbolic-codebase-context gap (the real cause of most "agent forgot the codebase" moments), and harden the diary with a greppable fallback.

---

*End of memory, codebase context, and auto-diarising document.*
