# Autonomous Software Engineering — Unified Implementation Guide

**This guide replaces `IMPLEMENTATION-GUIDE.md` for readers who want a single end-to-end walkthrough covering multiple tool variants.** The previous guide covered only Path A (Cursor + Claude Code) and Path B (Pure Cursor). This one covers:

- **Variant B-local** — Pure Cursor, local-only (Cloud Agents OFF)
- **Variant B-cloud** — Pure Cursor, cloud-enabled
- **Variant C** — Claude Code only (no Cursor)
- **Variant D** — Cline + Ollama (open-source, mostly-local)
- **Variant H** — OpenCode with GLM model routing
- **Variant E** — GitHub Copilot (analysed for suitability; implementation notes included)

It also adds the **Extended TDD flow** — the Test Architect selects specific test targets (at any level: unit, API, component, E2E, UX, visual) and the Implementer drives the full selected set to green, not just unit tests. This is the major capability upgrade over the previous guide.

Memory choices: either **MemPalace** (keep the diary-first workflow from `MEMORY-AND-CONTEXT.md`) or **mcp-memory-service** (more mature, knowledge-graph based). Both are documented here; pick one.

**Audience:** A technically fluent human who has read the design docs (`autonomous-swe-design.md`, UX addendum, `MEMORY-AND-CONTEXT.md`, `COST-ANALYSIS.md`) and is ready to execute.

**Time budget:** ~2 days to the end of Phase 5 (first real story). 1–2 weeks of calibration to steady state.

---

## Prerequisites (all variants)

Before you start, have:

- **Git 2.30+**
- **Node.js 20 LTS+** and **pnpm 9+** (assuming JS/TS stack; adjust for other stacks)
- **Python 3.11+** and **uv** (for Spec Kit, MemPalace / mcp-memory-service, Serena)
- **jq** (`brew install jq` or equivalent on windows `winget install jqlang.jq`)
- **GitHub CLI** (`brew install gh`) and `gh auth login`
- **A GitHub repo** you control
- **A Linear workspace**
- **A cloud account** for dev/test/staging/prod isolates (AWS, GCP, Azure, Fly.io, Vercel, Cloudflare — match your stack)

Install `uv` if missing:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Sanity check:

```bash
git --version && node --version && pnpm --version && python3 --version && jq --version
gh auth status
```

Variant-specific installs follow.

---

# Phase 0 — Project Onboarding Workflow (all variants)

Before any of the variant-specific install steps, run the BMAD-style project onboarding workflow. It produces every foundation document the later phases assume exists.

- Workflow file: `docs/autonomous-swe-kit/docs/workflows/0-onboarding/project-onboarding/workflow.md`
- Cursor command: `/project-onboard`
- Claude Code / non-Cursor: open `AGENTS.md` and follow the same workflow file manually, persona-by-persona.

The workflow halts at every artifact gate. Do not skip these gates: each one is a deliberate review point and several downstream rules rely on the artifacts being signed off (e.g., the readiness gate for Epic 0). Optional `party-mode` and `advanced-elicitation` sub-workflows are invoked only if their files exist; otherwise the orchestrator falls back to sequential persona handoff.

The onboarding workflow finishes by importing the backlog into Linear under team `Tokenomik` and confirming Epic 0 readiness; only then does the per-story loop in Phase 5 unblock.

---

# Phase 1 — Install the Tooling (variant-specific)

Pick **one** variant and follow that section. All other phases converge on shared commands with small variant callouts.

## Variant B-local — Pure Cursor, local-only

**Why pick this:** cheapest visual-IDE path ($20–60/mo), predictable cost, no cloud-agent spending risk. Sacrifices cloud parallelism (2–4 parallel agents locally vs 8 in cloud).

1. **Install Cursor** from https://cursor.com. Sign in.
2. **Enable features:** Settings → Features → **Agents Window**, **Team Rules**, **Automations**, **MCP Marketplace**. **Leave Cloud Agents OFF.**
3. **Set hard spend limit:** Settings → Usage → hard spend limit. Set to 2× your subscription tier (e.g. $40 if you're on Pro at $20) as a safety net.
4. **Install the Cursor CLI:**
   ```bash
   cursor-agent --version   # bundled with Cursor 3
   ```
   If missing, add Cursor's CLI bin dir to PATH (see Cursor docs).
5. **Install Spec Kit:**
   ```bash
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
   specify --version
   ```
6. **Install MCP servers later in Phase 2** once the repo exists. Proceed to Phase 2.

## Variant B-cloud — Pure Cursor, cloud-enabled

**Why pick this:** highest local throughput (8+ parallel cloud agents), Cursor Automations trigger on Linear Ready. Best for teams with real Linear velocity and discipline on spend caps. Cost: $200–700/mo steady state, higher without caps.

1–5. Same as B-local **except** enable **Cloud Agents** in Settings → Features. 6. **Critical — set spending hard cap BEFORE enabling cloud agents:** Settings → Usage → "Stop usage when budget reached" ON, budget = 2–5× your subscription. There is no undo on a $2,000 cloud-agent weekend. 7. Proceed to Phase 2.

## Variant C — Claude Code only

**Why pick this:** most predictable cost ($100–200/mo flat), best-of-class Agent Teams and hooks. Terminal-first; pair with VS Code extension or claude.ai/code browser for visual work.

1. **Install Claude Code:**
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude --version
   claude auth login
   claude -p "say hello"   # sanity check
   ```
2. **Install Spec Kit:**
   ```bash
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
   specify --version
   ```
3. **Install VS Code** (optional but recommended for diff review): https://code.visualstudio.com. Install the "Claude Code" extension.
4. Proceed to Phase 2.

## Variant D — Cline + Ollama

**Why pick this:** $0/mo possible with local models. Air-gapped capable. Transparent per-task token cost. Trade-off: orchestration less mature than Claude Code.

1. **Install VS Code** (or JetBrains, or Cursor — Cline runs in all three).
2. **Install Cline** from the VS Code marketplace (search "Cline").
3. **Install Ollama:**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   # macOS also has a native installer at https://ollama.com/download
   ```
4. **Pull coding models:**
   ```bash
   ollama pull qwen2.5-coder:32b       # ~20 GB — solid default
   ollama pull deepseek-coder-v2:16b   # ~9 GB — faster, slightly lower quality
   ollama pull qwen2.5-coder:7b        # ~4 GB — fast, for trivial tasks
   ```
5. **Configure Cline** in VS Code: Cline settings → Provider → Ollama → base URL `http://localhost:11434` → default model `qwen2.5-coder:32b`.
6. **(Optional) Add a paid API key** as a fallback provider for hard problems. Cline supports per-task model switching.
7. **Install Spec Kit:**
   ```bash
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
   specify --version
   ```
8. Proceed to Phase 2.

## Variant H — OpenCode with GLM

**Why pick this:** cheapest route to frontier-comparable autonomy ($30–100/mo heavy use) via model routing. Opus-class Planner, GLM-5 Implementer, Haiku/GLM-5-mini for trivia. Terminal-first, less polished than Cursor/Claude Code.

1. **Install OpenCode:**
   ```bash
   curl -fsSL https://opencode.ai/install | bash
   opencode --version
   ```
2. **Install Oh-My-OpenAgent plugin:**
   ```bash
   opencode plugin install oh-my-openagent
   ```
3. **Configure provider routing** — create `~/.opencode/config.yaml`:

   ```yaml
   providers:
     anthropic:
       api_key: ${ANTHROPIC_API_KEY}
     zai:
       api_key: ${ZAI_API_KEY} # for GLM-5 / GLM-5.1
       base_url: https://open.bigmodel.cn/api/paas/v4/
     openrouter:
       api_key: ${OPENROUTER_API_KEY}

   agent_routing:
     planner: anthropic/claude-opus-4.7
     architect: anthropic/claude-opus-4.7
     test-architect: anthropic/claude-sonnet-4.6
     implementer: zai/glm-5
     reviewer: anthropic/claude-sonnet-4.6
     ux-engineer: anthropic/claude-opus-4.7
   ```

4. **Install Spec Kit:**
   ```bash
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
   specify --version
   ```
5. **Install VS Code** for visual diff review. OpenCode runs in terminal.
6. Proceed to Phase 2.

## Variant E — GitHub Copilot (analysis)

**Can it run the autonomous implementation phase?** Yes, with architectural adjustments. The Copilot Coding Agent converts a GitHub issue to a PR autonomously, which maps naturally to the Planner → Implementer → PR flow. The adjustments are:

- Personas become `.github/copilot-instructions.md` (repo-level) and `.github/instructions/*.instructions.md` (path-scoped).
- Rules become the same `.github/instructions/` files with glob scopes.
- Hooks move into GitHub Actions workflows — `.github/workflows/enforce-plan-mode.yml`, `enforce-tokens.yml`, `verify-completion-promise.yml`.
- The read-only Planner constraint: run Planner as a **GitHub Actions workflow** with a Custom Agent whose tool allowlist only permits `read` and `write` to `docs/designs/**`. Block Issue-to-PR assignment until `docs/designs/{story-id}.md` exists.
- MCP (Linear, Serena, MemPalace): configured in Copilot's VS Code settings for local Agent Mode and in the GitHub Actions workflow for the Coding Agent (requires a self-hosted runner or a reachable MCP endpoint).

Installation:

1. **Subscribe to Copilot Pro ($10/mo) or Pro+ ($39/mo).** Note: new Pro/Pro+ sign-ups paused from 2026-04-20 per GitHub docs — existing subs unaffected; Business and Enterprise still open.
2. **Install the Copilot extension** in VS Code / JetBrains / whatever IDE you use.
3. **Enable Coding Agent** on your repo: repo Settings → Copilot → Coding agent → on.
4. **Install Spec Kit:**
   ```bash
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
   specify --version
   ```
5. Proceed to Phase 2. Copilot variant's specifics are flagged throughout.

---

# Phase 2 — Bootstrap the Repository (all variants, ~45 min)

### 2.1 Create the repo

```bash
mkdir my-project && cd my-project
git init
gh repo create my-project --private --source=. --remote=origin
```

### 2.2 Initialise Spec Kit

Variant-specific:

- **B-local / B-cloud:** `specify init . --ai cursor --ai-skills`
- **C:** `specify init . --ai claude --ai-skills`
- **D:** `specify init . --ai cline --ai-skills` (or use `--ai claude` — Cline reads the same files)
- **H:** `specify init . --ai claude --ai-skills` (OpenCode reads Claude-Code-compatible formats)
- **E:** `specify init . --ai copilot --ai-skills`

### 2.3 Create the directory skeleton (all variants)

```bash
# Docs tree
mkdir -p docs/{_seed,designs,tests,patterns,diary}
touch docs/{brief,prd,architecture,tech-stack,ux,ux-principles,constitution,backlog,design-system,test-strategy,environments,observability}.md

# Agent and rules trees for all tool layouts (harmless extras)
mkdir -p .claude/agents
mkdir -p .cursor/{rules,hooks,commands}
mkdir -p .cline/workflows
mkdir -p .github/{instructions,workflows}
touch AGENTS.md

# Design system skeleton (filled during Epic 0)
mkdir -p tokens/{core,semantic,themes}
mkdir -p components/{ui,primitives,blocks}
mkdir -p tests/{unit,api,component,e2e,visual,ux-flow}
mkdir -p scripts/hooks

# Memory local index — gitignored
echo ".mempalace/" >> .gitignore
echo ".mcp-memory/" >> .gitignore
echo ".cursor/rules/30-personal.mdc" >> .gitignore

git add -A && git commit -m "chore: initial project skeleton"
```

### 2.4 Install the persona files (all variants)

Copy all eight persona files into the relevant locations for your variant. Since personas work across tools with minor syntax, it's fine to copy them into multiple folders — tools ignore folders they don't read.

```bash
cp autonomous-swe-kit/agents/*.md .claude/agents/
cp autonomous-swe-kit/agents/*.md .cursor/commands/
cp autonomous-swe-kit/agents/*.md .github/instructions/  # Copilot reads .github/instructions/*.instructions.md
```

**Copilot variant** additionally: rename each to `<name>.instructions.md`, add the front-matter Copilot expects:

```yaml
---
applyTo: "**" # or a path glob
---
```

Cline variant: create `.cline/workflows/` entries that invoke each persona — Cline reads from `.cursor/commands/` by default but `.cline/workflows/` gives finer control.

### 2.5 Install the MCP servers — Linear + Serena + memory

Shared across all variants. Install once.

**Linear MCP:**

- **Cursor (B-local / B-cloud / D if using Cursor):** Settings → MCP → Add server → Linear → OAuth.
- **Claude Code (C):** `claude mcp add linear --transport http https://mcp.linear.app/mcp --scope user`
- **OpenCode (H):** Edit `~/.opencode/config.yaml`:
  ```yaml
  mcp_servers:
    linear:
      transport: http
      url: https://mcp.linear.app/mcp
  ```
- **Copilot (E):** VS Code → Copilot settings → MCP servers → add with the OAuth flow.

**Serena MCP** (symbol-level codebase context — see `MEMORY-AND-CONTEXT.md` §4):

- **Cursor:** Settings → MCP → Add server → paste:
  ```json
  {
    "mcpServers": {
      "serena": {
        "command": "uvx",
        "args": [
          "--from",
          "git+https://github.com/oraios/serena",
          "serena",
          "start-mcp-server"
        ]
      }
    }
  }
  ```
- **Claude Code:** `claude mcp add serena -- uvx --from "git+https://github.com/oraios/serena" serena start-mcp-server`
- **Cline:** Cline settings → MCP → add server with same command/args.
- **OpenCode:** `~/.opencode/config.yaml`:
  ```yaml
  mcp_servers:
    serena:
      command: uvx
      args:
        [
          "--from",
          "git+https://github.com/oraios/serena",
          "serena",
          "start-mcp-server",
        ]
  ```
- **Copilot:** works in local VS Code Agent Mode; the Coding Agent needs a self-hosted GitHub Actions runner with Serena reachable at `http://localhost:9121` (or a remote Serena deployment).

### 2.6 Install the memory server — MemPalace OR mcp-memory-service

**Pick one.** Both satisfy session memory + retrieval. Differences:

|           | MemPalace                                               | mcp-memory-service                               |
| --------- | ------------------------------------------------------- | ------------------------------------------------ |
| Maturity  | New (April 2026), Python API still churning             | Mature, Apache 2.0                               |
| Storage   | ChromaDB + wings/rooms/halls metadata                   | SQLite + knowledge graph with typed edges        |
| Diarising | Per-agent diary tools built in                          | Session-based storage; diarising via our hook    |
| Search    | Vector search via ChromaDB default embeddings           | Hybrid BM25 + vector, with decay/compression     |
| Setup     | `pip install mempalace`, 2 deps                         | Docker or Python; more config                    |
| Best for  | Teams already using MemPalace; diary-first mental model | Teams wanting a production-hardened memory layer |

#### Option A — MemPalace

```bash
pip install mempalace
mempalace --version
mempalace init .
```

Register MCP for your variant:

- **Cursor:** Settings → MCP → Add server: `{ "mcpServers": { "mempalace": { "command": "mempalace", "args": ["mcp"] } } }`
- **Claude Code:** `claude mcp add mempalace -- mempalace mcp`
- **Cline:** Cline settings → MCP → add command `mempalace` args `["mcp"]`.
- **OpenCode:**
  ```yaml
  mcp_servers:
    mempalace:
      command: mempalace
      args: ["mcp"]
  ```
- **Copilot:** Same as Serena — works locally, needs remote/self-hosted runner for Coding Agent.

See `MEMORY-AND-CONTEXT.md` §5 for deeper MemPalace configuration.

#### Option B — mcp-memory-service

```bash
# Docker (recommended)
git clone https://github.com/doobidoo/mcp-memory-service.git
cd mcp-memory-service
docker compose up -d
# Confirm: curl -s http://localhost:8765/health

# Or: pip install mcp-memory-service (self-hosted, run directly)
```

Register MCP:

- **Cursor / Cline / OpenCode:** Add MCP server pointing to `http://localhost:8765/mcp` (streamable HTTP). The exact JSON varies by tool; all support HTTP-transport MCP.
- **Claude Code:** `claude mcp add memory --transport http http://localhost:8765/mcp --scope user`
- **Copilot:** local VS Code works; Coding Agent needs the memory service deployed somewhere GitHub Actions can reach.

**If you pick mcp-memory-service, you also need the diary-append hook** (§2.9 below) because mcp-memory-service doesn't have first-class per-agent diarising like MemPalace.

### 2.7 Rules — author `00-index`, `40-serena`, `41-memory`

These apply to Cursor, Claude Code, Cline, OpenCode (all read `.cursor/rules/*.mdc` with minor format differences). For Copilot, the same content goes in `.github/instructions/` with `.instructions.md` extension.

```bash
cat > .cursor/rules/00-index.mdc <<'EOF'
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
EOF

cat > .cursor/rules/40-serena.mdc <<'EOF'
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
EOF

# Memory rule — adapt based on your choice
if [ -n "$MEMPALACE" ]; then
cat > .cursor/rules/41-memory.mdc <<'EOF'
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
EOF
else
cat > .cursor/rules/41-memory.mdc <<'EOF'
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
EOF
fi
```

### 2.8 Copy rules into all variants that need them

```bash
# Copilot variant: also copy to .github/instructions/
cp .cursor/rules/40-serena.mdc .github/instructions/40-serena.instructions.md
cp .cursor/rules/41-memory.mdc .github/instructions/41-memory.instructions.md
# Prepend Copilot front-matter
for f in .github/instructions/*.instructions.md; do
  # Add applyTo front-matter — skip for brevity, see Copilot docs
  true
done
```

### 2.9 Install the hook scripts (all variants)

The same bash scripts work across Cursor, Claude Code, Cline, and OpenCode. For Copilot, they become GitHub Actions workflow steps (templates at the end of this phase).

Create the standard six guardrail scripts plus the extended TDD support scripts:

```bash
# -- 1. Block dangerous commands --------------------------------
cat > scripts/hooks/block-dangerous.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
DANGER='rm\s+-rf\s+/|git push\s+.*--force.*\smain|git push\s+.*-f.*\smain|:(){:|:&};:'
if echo "$CMD" | grep -qE "$DANGER"; then
  jq -n --arg reason "Blocked destructive command: $CMD" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
EOF

# -- 2. Enforce plan-mode (requires design.md before code writes) --
cat > scripts/hooks/enforce-plan-mode.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
[ -z "$STORY_ID" ] && exit 0
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
case "$FILE" in docs/*|tests/*|*/docs/*|*/tests/*) exit 0 ;; esac
if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No docs/designs/${STORY_ID}.md exists. Run the Planner agent first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
EOF

# -- 3. Enforce tokens (block hex/rgb/pixel in component code) ----
cat > scripts/hooks/enforce-tokens.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')
case "$FILE" in
  tokens/*|*/tokens/*|generated/*|*/generated/*|*/theme*|.*|tailwind.config*|*.test.*|*.spec.*) exit 0 ;;
esac
case "$FILE" in
  components/*|app/*|src/components/*|src/app/*|*/components/*|*/app/*) ;;
  *) exit 0 ;;
esac
if echo "$CONTENT" | grep -qE '#[0-9a-fA-F]{3,8}\b|rgba?\(|\b[0-9]+px\b'; then
  jq -n --arg reason "Hex/rgb/pixel literals forbidden in component code. Use semantic tokens from tokens/semantic/." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
exit 0
EOF

# -- 4. vibecop + lint + format ----------------------------------
cat > scripts/hooks/vibecop-lint.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
EXT="${FILE##*.}"
command -v vibecop >/dev/null && vibecop check "$FILE" 2>&1 | head -20
case "$EXT" in
  js|jsx|ts|tsx|json|css|md)
    npx prettier --write "$FILE" 2>/dev/null
    npx eslint --fix "$FILE" 2>/dev/null ;;
  py) ruff check --fix "$FILE" 2>/dev/null; ruff format "$FILE" 2>/dev/null ;;
  go) gofmt -w "$FILE" 2>/dev/null ;;
  rs) rustfmt "$FILE" 2>/dev/null ;;
esac
exit 0
EOF

# -- 5. Verify completion promise (extended — now checks the targeted suite) --
cat > scripts/hooks/verify-completion-promise.sh <<'EOF'
#!/bin/bash
# Stop hook — require STORY_COMPLETE + passing TARGETED test suite
# The targeted suite is defined in docs/tests/{story-id}-targets.txt
# (one test path or pattern per line). Test Architect writes it.

INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
MAX=30
if [ "$LOOP" -ge "$MAX" ]; then echo '{}'; exit 0; fi

BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
TARGETS_FILE="docs/tests/${STORY_ID}-targets.txt"
SCRATCH=".cursor/scratchpad.md"

if grep -q "STORY_COMPLETE" "$SCRATCH" 2>/dev/null; then
  # Run the targeted suite defined by Test Architect
  if [ -f "$TARGETS_FILE" ]; then
    # Invoke the unified test runner (installed in 2.10)
    if ./scripts/run-targeted-tests.sh "$TARGETS_FILE"; then
      echo '{}'; exit 0
    fi
  else
    # Fall back to the full affected suite
    if pnpm test --run 2>/dev/null; then echo '{}'; exit 0; fi
  fi
fi

jq -n --arg msg "Iteration $((LOOP+1))/$MAX. Targeted tests from ${TARGETS_FILE} must all pass. Emit <promise>STORY_COMPLETE</promise> only when every one is green." \
  '{followup_message: $msg}'
EOF

# -- 6. Diary append --------------------------------------------
cat > scripts/hooks/diary-append.sh <<'EOF'
#!/bin/bash
INPUT=$(cat)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MONTH=$(date -u +"%Y-%m")
TODAY=$(date -u +"%Y-%m-%d")
DIR="docs/diary/${MONTH}"
FILE="${DIR}/${TODAY}.md"
mkdir -p "$DIR"
[ ! -f "$FILE" ] && { echo "# Diary — $TODAY"; echo ""; } > "$FILE"
PERSONA="${CLAUDE_AGENT_NAME:-${CURSOR_AGENT_NAME:-${CLINE_AGENT_NAME:-unknown}}}"
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .hook_event_name // "start"')
BRANCH=$(git branch --show-current 2>/dev/null || echo "-")
STORY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')
case "$HOOK_EVENT" in
  SessionStart) echo "- ${NOW} | ${PERSONA} | [start] branch=${BRANCH} story=${STORY}" >> "$FILE" ;;
  PostToolUse)
    if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "Bash" ]]; then
      FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
      CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | head -c 80)
      SUMMARY="${FILE_PATH:-$CMD}"
      echo "- ${NOW} | ${PERSONA} | ${TOOL} | ${SUMMARY}" >> "$FILE"
    fi ;;
  Stop) echo "- ${NOW} | ${PERSONA} | [stop] branch=${BRANCH}" >> "$FILE" ;;
esac
exit 0
EOF

chmod +x scripts/hooks/*.sh
```

### 2.10 Install the targeted test runner (new — extended TDD)

The Test Architect lists the test paths/patterns the Implementer must drive to green. This list covers **any tier** — unit, API, component, E2E, UX-flow, visual. The runner dispatches to the right tier tool based on path.

```bash
cat > scripts/run-targeted-tests.sh <<'EOF'
#!/bin/bash
# Usage: ./scripts/run-targeted-tests.sh docs/tests/AUTH-101-targets.txt
# Runs the tests listed in the targets file — one pattern per line.
# Each line can be a tier prefix (unit:, api:, e2e:, visual:, ux-flow:, component:)
# followed by a path or pattern, e.g.:
#   unit: tests/unit/auth/password-reset.test.ts
#   api: tests/api/auth.test.ts::"POST /auth/reset"
#   e2e: tests/e2e/auth/reset-flow.spec.ts
#   visual: tests/visual/primitives/AppButton.spec.ts
#   ux-flow: tests/ux-flow/password-reset.spec.ts
#
# Returns 0 if ALL targeted tests pass. Non-zero on any failure or missing runner.

TARGETS="$1"
[ -z "$TARGETS" ] && { echo "Usage: $0 <targets-file>"; exit 2; }
[ ! -f "$TARGETS" ] && { echo "Targets file not found: $TARGETS"; exit 2; }

declare -A UNIT API COMPONENT E2E VISUAL UX_FLOW OTHER
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  case "$line" in \#*) continue ;; esac
  TIER="${line%%:*}"
  SPEC="${line#*: }"
  case "$TIER" in
    unit) UNIT[$SPEC]=1 ;;
    api) API[$SPEC]=1 ;;
    component) COMPONENT[$SPEC]=1 ;;
    e2e) E2E[$SPEC]=1 ;;
    visual) VISUAL[$SPEC]=1 ;;
    ux-flow) UX_FLOW[$SPEC]=1 ;;
    *) OTHER[$line]=1 ;;
  esac
done < "$TARGETS"

FAIL=0

# Unit + Component (Vitest / Jest / Mocha — detect)
if [ ${#UNIT[@]} -gt 0 ] || [ ${#COMPONENT[@]} -gt 0 ]; then
  echo "[run-targeted-tests] unit + component..."
  FILES=("${!UNIT[@]}" "${!COMPONENT[@]}")
  if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ]; then
    npx vitest run "${FILES[@]}" || FAIL=1
  elif [ -f "jest.config.js" ] || [ -f "jest.config.ts" ]; then
    npx jest "${FILES[@]}" || FAIL=1
  else
    pnpm test -- "${FILES[@]}" || FAIL=1
  fi
fi

# API (Supertest / Testcontainers harness — typically Vitest-backed)
if [ ${#API[@]} -gt 0 ]; then
  echo "[run-targeted-tests] api..."
  FILES=("${!API[@]}")
  npx vitest run --config vitest.api.config.ts "${FILES[@]}" || FAIL=1
fi

# E2E (Playwright)
if [ ${#E2E[@]} -gt 0 ]; then
  echo "[run-targeted-tests] e2e..."
  FILES=("${!E2E[@]}")
  npx playwright test "${FILES[@]}" || FAIL=1
fi

# Visual (Playwright screenshot)
if [ ${#VISUAL[@]} -gt 0 ]; then
  echo "[run-targeted-tests] visual..."
  FILES=("${!VISUAL[@]}")
  npx playwright test --config playwright.visual.config.ts "${FILES[@]}" || FAIL=1
fi

# UX-flow (Playwright — typically a separate project configuration)
if [ ${#UX_FLOW[@]} -gt 0 ]; then
  echo "[run-targeted-tests] ux-flow..."
  FILES=("${!UX_FLOW[@]}")
  npx playwright test --config playwright.ux-flow.config.ts "${FILES[@]}" || FAIL=1
fi

# Custom / other — each line is a shell command
if [ ${#OTHER[@]} -gt 0 ]; then
  echo "[run-targeted-tests] custom..."
  for cmd in "${!OTHER[@]}"; do eval "$cmd" || FAIL=1; done
fi

if [ "$FAIL" -eq 0 ]; then
  echo "[run-targeted-tests] ALL GREEN across tiers"
  exit 0
else
  echo "[run-targeted-tests] FAILURES — see output above"
  exit 1
fi
EOF
chmod +x scripts/run-targeted-tests.sh
```

### 2.11 Register hooks (variant-specific)

**Variants B-local / B-cloud (Cursor):**

```bash
cat > .cursor/hooks/wrappers.ts <<'EOF'
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
function runBash(script: string) {
  const input = readFileSync(0, "utf-8");
  const res = spawnSync("bash", [script], { input, encoding: "utf-8" });
  if (res.stdout) process.stdout.write(res.stdout);
  process.exit(res.status ?? 0);
}
runBash(process.argv[2]);
EOF

cat > .cursor/settings.json <<'EOF'
{
  "hooks": {
    "sessionStart":    "node .cursor/hooks/wrappers.ts ./scripts/hooks/diary-append.sh",
    "preToolBash":     "node .cursor/hooks/wrappers.ts ./scripts/hooks/block-dangerous.sh",
    "preToolWrite":    "node .cursor/hooks/wrappers.ts ./scripts/hooks/enforce-plan-mode.sh",
    "preToolWriteUi":  "node .cursor/hooks/wrappers.ts ./scripts/hooks/enforce-tokens.sh",
    "postToolWrite":   "node .cursor/hooks/wrappers.ts ./scripts/hooks/vibecop-lint.sh",
    "postToolAny":     "node .cursor/hooks/wrappers.ts ./scripts/hooks/diary-append.sh",
    "stop":            "node .cursor/hooks/wrappers.ts ./scripts/hooks/verify-completion-promise.sh"
  }
}
EOF
```

**Variant C (Claude Code):**

```bash
cat > .claude/settings.json <<'EOF'
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "./scripts/hooks/diary-append.sh" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "./scripts/hooks/block-dangerous.sh" }] },
      { "matcher": "Write|Edit", "hooks": [
        { "type": "command", "command": "./scripts/hooks/enforce-plan-mode.sh" },
        { "type": "command", "command": "./scripts/hooks/enforce-tokens.sh" }
      ]}
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "./scripts/hooks/vibecop-lint.sh" }] },
      { "matcher": "Write|Edit|Bash", "hooks": [{ "type": "command", "command": "./scripts/hooks/diary-append.sh" }] }
    ],
    "Stop": [
      { "hooks": [
        { "type": "command", "command": "./scripts/hooks/verify-completion-promise.sh" },
        { "type": "command", "command": "./scripts/hooks/diary-append.sh" }
      ]}
    ]
  }
}
EOF
```

**Variant D (Cline):** Cline hooks are set via a combination of `.cline/workflows/` and the project-level `.clinerules`. The scripts are invoked through Cline's command hooks:

```bash
cat > .clinerules <<'EOF'
# Project rules — loaded every session
pre_tool_bash: ./scripts/hooks/block-dangerous.sh
pre_tool_write:
  - ./scripts/hooks/enforce-plan-mode.sh
  - ./scripts/hooks/enforce-tokens.sh
post_tool_write:
  - ./scripts/hooks/vibecop-lint.sh
  - ./scripts/hooks/diary-append.sh
stop: ./scripts/hooks/verify-completion-promise.sh
EOF
```

(Cline's hook schema evolves; check latest docs at cline.bot if fields differ.)

**Variant H (OpenCode):** Edit `~/.opencode/config.yaml`:

```yaml
hooks:
  pre_tool_bash: ./scripts/hooks/block-dangerous.sh
  pre_tool_write:
    [./scripts/hooks/enforce-plan-mode.sh, ./scripts/hooks/enforce-tokens.sh]
  post_tool_write:
    [./scripts/hooks/vibecop-lint.sh, ./scripts/hooks/diary-append.sh]
  stop: ./scripts/hooks/verify-completion-promise.sh
```

**Variant E (Copilot):** hooks become GitHub Actions workflows. See `.github/workflows/` templates in §2.12 below.

### 2.12 Copilot variant — GitHub Actions enforcement

For the Copilot variant, the hook logic moves to GitHub Actions workflows that run on every PR:

```bash
cat > .github/workflows/enforce-plan-mode.yml <<'EOF'
name: Enforce plan-mode
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Require design doc
        run: |
          STORY_ID=$(echo "${{ github.head_ref }}" | grep -oE '[A-Z]+-[0-9]+' | head -1)
          if [ -z "$STORY_ID" ]; then echo "No story ID in branch name"; exit 0; fi
          if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
            echo "❌ Missing docs/designs/${STORY_ID}.md"
            exit 1
          fi
          echo "✅ Design doc present"
EOF

cat > .github/workflows/enforce-tokens.yml <<'EOF'
name: Enforce design tokens
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Block hex/rgb/px in component code
        run: |
          CHANGED=$(git diff --name-only origin/main...HEAD -- 'components/**' 'app/**' 'src/components/**' 'src/app/**')
          [ -z "$CHANGED" ] && exit 0
          if grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]+px\b' $CHANGED | grep -v '^\s*//' ; then
            echo "❌ Hex/rgb/px literals found"
            exit 1
          fi
          echo "✅ No raw design literals"
EOF

cat > .github/workflows/verify-completion-promise.yml <<'EOF'
name: Verify targeted tests
on: [pull_request]
jobs:
  targeted-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup
        uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: pnpm install
      - name: Run targeted test suite
        run: |
          STORY_ID=$(echo "${{ github.head_ref }}" | grep -oE '[A-Z]+-[0-9]+' | head -1)
          TARGETS="docs/tests/${STORY_ID}-targets.txt"
          if [ -f "$TARGETS" ]; then
            ./scripts/run-targeted-tests.sh "$TARGETS"
          else
            echo "No targets file; running default affected suite"
            pnpm test --run
          fi
EOF
```

Make these required checks on your main branch: Settings → Branches → Protection rule for `main` → "Require status checks to pass" → select all three.

### 2.13 Commit

```bash
git add -A && git commit -m "chore: add personas, rules, hooks, memory, targeted test runner"
```

---

# Phase 3 — Run Ideation (all variants, 1–3 hours)

Human-led. Commands differ by variant but flow is identical.

### 3.1 Drop seed material

Put notes, research, competitor screenshots, etc. in `docs/_seed/`.

### 3.2 Run the Analyst

- **B-local / B-cloud:** Cursor Agents Window → `/analyst` with prompt "Produce docs/brief.md. My starting idea is: …".
- **C:** `claude` → `> Use the analyst agent to produce docs/brief.md. My starting idea is: …`
- **D:** Cline → select `analyst` persona → same prompt.
- **H:** `opencode` → `> /analyst produce docs/brief.md. My starting idea is: …`
- **E:** GitHub Issues → create an issue titled "Ideation: <idea>" → assign to @github-copilot with instruction "act as analyst.instructions.md; produce docs/brief.md as a PR against main".

Answer up to 5 questions. Iterate until the brief is tight.

### 3.3 Run the Architect

Same pattern for all variants — invoke the `architect` persona with "Load docs/brief.md. Produce prd.md, architecture.md, tech-stack.md, ux.md, constitution.md, backlog.md."

Review each. Push back on:

- Unpinned versions in `tech-stack.md`
- Weak non-negotiables in `constitution.md`
- Stories longer than 3 hours of agent work in `backlog.md`

### 3.4 Run the UX Engineer (Ideation mode)

Invoke `ux-engineer` to produce `docs/ux-principles.md` + initial wireframes (Paper or Penpot, see UX addendum).

### 3.5 Spec Kit consistency

- **B / D:** `/speckit.analyze`
- **C / H:** `claude` → `> /speckit.analyze` (or `opencode` equivalent)
- **E:** Run Spec Kit's analyze step as a GitHub Action or local command — `specify analyze .`

Fix anything it flags.

### 3.6 Import backlog to Linear

Any variant: invoke any agent with "Using the linear MCP, create a Linear project for this codebase and import the epics/stories from docs/backlog.md. Maintain the epic structure."

Move Epic 0 to "Ready"; leave feature epics in "Backlog".

### 3.7 Commit

```bash
git add -A && git commit -m "docs: ideation complete"
```

---

# Phase 4 — Run Epic 0 (all variants, 4–8 hours)

Three parallel worktrees: Platform Engineer, Test Architect, UX Engineer.

### 4.1 Create three worktrees

```bash
REPO_DIR=$(pwd)
git worktree add ../$(basename $REPO_DIR).epic0-platform -b epic0/platform
git worktree add ../$(basename $REPO_DIR).epic0-testing -b epic0/testing
git worktree add ../$(basename $REPO_DIR).epic0-ux -b epic0/ux
```

### 4.2 Invoke each track

**Variant-specific parallelism:**

- **B-local:** three Cursor windows or three VS Code sessions — 2–4 parallel local agents tolerable.
- **B-cloud:** Cursor Agents Window spawns all three as cloud agents. Fastest.
- **C:** three `claude` sessions. Fine for Epic 0 one-time work.
- **D:** three VS Code windows with Cline in each.
- **H:** three `opencode` sessions.
- **E:** three GitHub Issues assigned to @github-copilot; three PRs in parallel.

Prompts per track:

- Platform: "Use the platform-engineer agent. Load docs/architecture.md and docs/tech-stack.md. Build Epic 0 deliverables and ship hello-world through dev → test → staging → prod."
- Testing: "Use the test-architect agent. Produce docs/test-strategy.md and scaffold the six-tier harness. Create Vitest, Playwright, visual-regression, and ux-flow configs. Write example trivial passing tests in each tier to validate the plumbing. Update .cursor/rules/10-testing.mdc."
- UX: "Use the ux-engineer agent. Build tokens/, run `pnpm dlx shadcn@latest init --base base-ui`, wrap primitives, install Storybook with addon-a11y, commit visual regression baseline, write docs/design-system.md."

### 4.3 Merge Epic 0

```bash
cd $REPO_DIR
gh pr list --state open
# Review each, merge with:
gh pr review <NUM> --approve
gh pr merge <NUM> --squash --delete-branch
git worktree remove ../$(basename $REPO_DIR).epic0-platform
git worktree remove ../$(basename $REPO_DIR).epic0-testing
git worktree remove ../$(basename $REPO_DIR).epic0-ux
```

### 4.4 Epic 0 exit gate

Before advancing, confirm every box:

- [ ] Hello-world deploys to dev, test, staging, prod
- [ ] **All six test tiers** (unit / api / component / e2e / visual / ux-flow) execute in CI with trivially-passing examples
- [ ] `scripts/run-targeted-tests.sh` runs each tier correctly in isolation
- [ ] Coverage reports publish to PR comments
- [ ] Visual regression snapshots committed for primitive matrix
- [ ] Storybook runs locally and in CI
- [ ] All Epic 0 docs exist and are non-trivial
- [ ] `.cursor/rules/` (and `.github/instructions/` if Copilot variant) populated with 01–05, 10, 40, 41
- [ ] Hooks verified by triggering each once
- [ ] Memory server (`mempalace_search` or `memory_search`) returns relevant results
- [ ] Serena `find_symbol` works on the hello-world code
- [ ] `docs/diary/YYYY-MM/YYYY-MM-DD.md` has entries

Unchecked boxes poison every subsequent story. Do not proceed.

---

# Phase 5 — First Story With Extended TDD (all variants, 2–4 hours)

This is where the **Extended TDD flow** takes over from the basic "unit tests go green" pattern. The Test Architect selects a specific set of test targets across tiers, and the Implementer drives all of them to green. The targeted suite lives in `docs/tests/{story-id}-targets.txt`.

### 5.1 Move story to "Ready" in Linear

Note its ID (e.g. `AUTH-101`).

### 5.2 Create the worktree

```bash
STORY_ID=AUTH-101
git worktree add ../$(basename $(pwd)).${STORY_ID} -b feature/${STORY_ID}-short-slug
cd ../$(basename $(pwd)).${STORY_ID}
./scripts/bootstrap-worktree.sh
```

### 5.3 Run Planner

All variants: invoke `planner` with "Use the planner agent for Linear story AUTH-101."

Planner produces `docs/designs/AUTH-101.md`. This is read-only — the `enforce-plan-mode.sh` hook blocks any Write/Edit outside docs/ and tests/ until this file exists.

If the Planner classifies the story as UI-new, run `ux-engineer` first, then re-invoke Planner.

### 5.4 Run Test Architect — the key Extended TDD step

Prompt:

> Use the test-architect agent for story AUTH-101. Do all of:
>
> 1. Read docs/designs/AUTH-101.md.
> 2. Decide which test tiers apply (unit, api, component, e2e, visual, ux-flow). Multiple tiers are expected for anything non-trivial.
> 3. Write failing tests across all applicable tiers.
> 4. Produce docs/tests/AUTH-101.md explaining the tier rationale and the exit criteria.
> 5. Produce docs/tests/AUTH-101-targets.txt — a machine-readable list of the specific test files/patterns the Implementer must drive to green. Format: one target per line, prefixed by tier. Example:
>
> ```
> unit: tests/unit/auth/password-reset.test.ts
> api: tests/api/auth.test.ts
> e2e: tests/e2e/auth/reset-flow.spec.ts
> ```
>
> 6. Verify each tier's tests are RED by running ./scripts/run-targeted-tests.sh docs/tests/AUTH-101-targets.txt. All should fail with meaningful messages.
> 7. Commit all the test files, docs/tests/AUTH-101.md, and docs/tests/AUTH-101-targets.txt with message "test(AUTH-101): add failing tests across tiers".

The Test Architect's value here is **selecting** the right tiers. A pure backend change might be unit + api. A new UI interaction might be component + e2e + visual + ux-flow. A cross-cutting refactor might be all six. The targets file is the Test Architect's contract with the Implementer — everything in it must be green before STORY_COMPLETE.

### 5.5 Run Implementer — drives all tiers to green

Prompt:

> Use the implementer agent for story AUTH-101. Follow the Extended TDD loop:
>
> 1. Read docs/designs/AUTH-101.md (the design).
> 2. Read docs/tests/AUTH-101.md (the test plan) and docs/tests/AUTH-101-targets.txt (the exact targets).
> 3. Run ./scripts/run-targeted-tests.sh docs/tests/AUTH-101-targets.txt — confirm RED across tiers.
> 4. Iterate: pick the smallest failing test across any tier, write the minimum code to make it pass, run the targeted suite again. Continue until the entire suite is green.
> 5. For UI-affecting tiers (component, e2e, visual, ux-flow), prefer Serena-assisted symbol-level edits over full-file rewrites.
> 6. When all targets are green, emit STORY_COMPLETE in .cursor/scratchpad.md.
>    The verify-completion-promise hook will block you if any targeted test is still red.

Watch the loop. Typical story: 5–20 iterations. Complex multi-tier stories: up to the 30 cap. If the Implementer hits the cap, the hook surfaces a BLOCKED state — stop and let a human revisit.

### 5.6 Run Reviewer and open PR

```bash
gh pr create --draft --title "feat(AUTH-101): ..." --body "Closes AUTH-101"
PR=$(gh pr view --json number -q .number)
```

Invoke `reviewer` with "Use the reviewer agent on PR #$PR. Pay specific attention to whether the implementation matches the design, whether every target in docs/tests/AUTH-101-targets.txt is genuinely exercised, and whether any tier could have caught a real bug that the current tests miss."

The Reviewer's multi-lane output (security, perf, a11y, quality, architecture drift, coverage, UI) posts as a PR comment. Address BLOCKING findings.

### 5.7 CI runs, human merges

```bash
gh pr review $PR --approve
gh pr merge $PR --squash --delete-branch
```

### 5.8 Calibrate

Before story 2:

- Did the Test Architect select the right tiers? Missing tier → add to strategy. Over-selection → tune persona.
- Did the Implementer get stuck mid-tier? Usually a design gap — strengthen Planner's output structure.
- Did any targeted test trivially pass (e.g. assertion missing)? Strengthen Test Architect's rule about assertion quality.
- Did the Reviewer miss a drift? Strengthen reviewer persona with specific patterns to BLOCK.

Update personas, rules, hooks. Commit.

---

# Phase 6 — Scale to Parallel & Always-On

### 6.1 Enable parallel execution

**Variant B-local:**

```bash
# Local parallelism is bounded by CPU — 2–4 agents realistic
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    cursor-agent --prompt "Run planner → test-architect → implementer for Linear story ${STORY}. Emit STORY_COMPLETE when docs/tests/${STORY}-targets.txt is all green." \
                 --autonomous \
                 --max-iterations 25 \
                 --quality-gates "test,lint,type-check" \
                 --auto-commit --create-pr > .agent-log.json) &
done
wait
EOF
```

**Variant B-cloud:** the Cursor Agents Window spawns cloud agents natively — no script needed. Set per-run budget caps in each Automation.

**Variant C:**

```bash
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    claude -p "Run planner → test-architect → implementer for Linear story ${STORY}. Drive docs/tests/${STORY}-targets.txt to green. Emit STORY_COMPLETE when done." \
           --max-budget-usd 10.00 \
           --max-iterations 25 \
           --output-format json > .agent-log.json) &
done
wait
EOF
```

**Variant D:**

```bash
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    cline run --prompt "Run planner → test-architect → implementer for story ${STORY}. Drive docs/tests/${STORY}-targets.txt to green." \
              --auto-approve \
              --max-iterations 25 > .agent-log.json) &
done
wait
EOF
```

**Variant H:**

```bash
# OpenCode with GLM-5 for Implementer, Opus for Planner — config handled in ~/.opencode/config.yaml
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    opencode run --agent planner --agent test-architect --agent implementer \
                 --story "${STORY}" \
                 --max-iterations 25 > .agent-log.json) &
done
wait
EOF
```

**Variant E (Copilot):** parallelism is per-issue. Assign multiple Linear-synced GitHub Issues to @github-copilot; each runs a separate Coding Agent session in a separate GitHub Actions runner. True parallel — limited only by your Actions minutes budget.

```bash
chmod +x scripts/run-parallel.sh
```

### 6.2 Always-on pickup of Ready stories

**Variants B-local / B-cloud:** Cursor → Automations → New automation:

- Trigger: Linear webhook → status changed to "Ready"
- Action: spawn planner → test-architect → implementer
- Budget: per-run cap ($5–20)

**Variant C:** GitHub Actions cron:

```yaml
# .github/workflows/claude-pickup.yml
name: Claude pickup of Ready stories
on:
  schedule: [{ cron: "*/30 * * * *" }]
  workflow_dispatch:
jobs:
  pickup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code
      - name: Fetch Ready stories from Linear and process
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
        run: |
          # Query Linear for "Ready" stories, loop, spawn an agent per story
          # with --max-budget-usd 10 each. See project README for the full script.
          bash scripts/pickup-ready-stories.sh
```

**Variant D (Cline):** Cline's CLI mode plus a similar cron on GitHub Actions or self-hosted runner.

**Variant H (OpenCode):** same pattern as C — cron + `opencode run`.

**Variant E (Copilot):** Linear has a native GitHub integration that creates a GitHub Issue when a Linear story hits "Ready". Configure that integration to auto-assign new issues to @github-copilot. End-to-end automatic.

### 6.3 Enable Playwright Test Agents (all variants)

```bash
npx playwright init-agents --loop=claude   # or --loop=cursor depending on variant
```

Wire cron workflows: Planner weekly, Generator on spec changes, Healer on failure. These feed back into the e2e and ux-flow tiers — the targeted tests list gets updated automatically when the Test Agents find gaps.

### 6.4 Monday rollup

Invoke any agent:

> Add an automation that runs every Monday at 9am. Summarise the past week: merged PRs, test pass rate (per tier), coverage trend, flaky tests, visual regression diffs. Read docs/diary/ for that week's entries and summarise who did what. Post to Slack via the Slack MCP.

### 6.5 Onlook roundtrip

Pick a merged UI story. Open the running app in Onlook. Tweak. Confirm:

- Onlook creates a branch
- Edit maps to correct `.tsx`
- Tailwind classes update, no hex literals leak through (the `enforce-tokens` check stops them)
- PR opens, CI runs all six tiers, visual regression passes

---

# Phase 7 — Daily Operating Procedure

### Morning (10 min)

1. Agents window / GitHub PR dashboard — glance
2. Review overnight draft PRs (expect Reviewer comments already in place)
3. Unblock any BLOCKED stories — usually means the Test Architect selected an impossible target, or the Planner missed an integration point; both easy to diagnose from the diary
4. Mondays: read the rollup

### Story creation (30–60 min per epic)

1. Analyst + Architect draft stories into Linear
2. Move top N to "Ready" (N = parallel agents comfortable per variant)

### During the day

- Reviews, merges, occasional spec tweaks
- Onlook for visual polish

### Weekly (60 min)

1. Monday rollup
2. Metrics: cycle time per tier, flake rate per tier, coverage trend
3. Top 3 friction points → tune personas / rules / hooks / diary / targets selection

### Per model update

1. Canonical 5-story eval fixture
2. Regression check — targeted tests still drive green? BLOCKED rate change?
3. Stay pinned if regression; roll forward if clean

---

# Phase 8 — Troubleshooting

| Symptom                                   | Likely cause                            | Fix                                                                                                |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Planner writes code despite read-only     | `disallowedTools` not set               | Re-check frontmatter; verify with `/agents`                                                        |
| Hooks don't fire (C)                      | `.claude/settings.json` missing         | `chmod +x`; confirm via `claude --debug`                                                           |
| Hooks don't fire (B)                      | Cursor hook schema drifted              | Read Cursor's latest hook docs                                                                     |
| Hooks don't fire (D)                      | `.clinerules` wrong field names         | Check Cline docs for current field names                                                           |
| Hooks don't fire (E/Copilot)              | Required checks not configured          | Settings → Branches → Protection rule                                                              |
| Implementer exits without STORY_COMPLETE  | Stop hook not blocking                  | Check `verify-completion-promise.sh` registered in Stop                                            |
| Targeted tests don't run                  | Missing targets file or wrong runner    | Check `docs/tests/{story-id}-targets.txt` exists; run runner manually                              |
| Runner says "config not found" for a tier | Epic 0 didn't set up that tier's config | Add e.g. `vitest.api.config.ts` or `playwright.visual.config.ts` and commit                        |
| Agents drift from architecture            | Rules file too long                     | Cut always-on content under ~2,000 tokens                                                          |
| Hex colours keep appearing                | `enforce-tokens.sh` not matching        | Test hook manually with sample stdin JSON                                                          |
| Visual regression flakes                  | Animations/fonts                        | `animations: "disabled"`, pin Playwright browser, `--update-snapshots` only on intentional changes |
| Worktree collisions                       | Branches deleted, worktrees not cleaned | `git worktree prune` post-merge                                                                    |
| Linear MCP auth lost                      | OAuth expired                           | Remove & re-add                                                                                    |
| Cost runs away (B-cloud)                  | No per-run cap                          | Set Cursor Automation budget; Settings → Usage hard cap                                            |
| Cost runs away (C)                        | No `--max-budget-usd`                   | Add to every headless invocation                                                                   |
| Cost runs away (D)                        | API calls unbounded                     | Add `--max-iterations` and per-session budget watcher                                              |
| Ollama too slow for Implementer (D)       | Small GPU                               | Swap to `qwen2.5-coder:7b` for faster (lower quality) OR escalate specific tasks to API            |
| GLM responses look wrong (H)              | Provider routing misconfigured          | Check `~/.opencode/config.yaml` agent_routing block; confirm provider API key set                  |
| Copilot Coding Agent stuck (E)            | Premium request budget depleted         | Check Settings → Copilot → Premium requests; top up or upgrade tier                                |
| MemPalace init hangs                      | ChromaDB dep                            | `pip install --upgrade chromadb pyyaml`                                                            |
| mcp-memory-service unreachable            | Docker not running or port conflict     | `docker compose ps`; check port 8765                                                               |
| Diary entries missing for some personas   | Soft prompt ignored                     | Strengthen 41-memory.mdc; rely on diary-append hook                                                |
| Reviewer approves everything              | Severity rubric too loose               | Tighten persona — move patterns to BLOCKING                                                        |
| Serena MCP disconnected                   | `uvx` not on PATH                       | Install `uv`, restart IDE                                                                          |
| Serena empty for a language               | LSP not installed                       | `uvx … serena install-lsp <language>`                                                              |

---

# Reference — File Map After Full Setup

```
my-project/
├── .claude/agents/                       # Variant C & H primary
├── .cursor/{rules,hooks,commands}/       # Variant B-* primary
├── .cline/workflows/                     # Variant D primary
├── .github/
│   ├── instructions/                     # Variant E primary
│   └── workflows/                        # All variants — CI + E's enforcement
├── .specify/                             # Spec Kit templates
├── .mempalace/ OR .mcp-memory/           # Memory local index — gitignored
├── AGENTS.md                             # Plain-markdown agent instructions
├── components/{ui,primitives,blocks}/
├── docs/
│   ├── _seed/
│   ├── brief.md prd.md architecture.md tech-stack.md
│   ├── ux.md ux-principles.md constitution.md backlog.md
│   ├── design-system.md test-strategy.md environments.md observability.md
│   ├── designs/{story-id}.md             # Planner's design
│   ├── tests/{story-id}.md               # Test Architect's plan
│   ├── tests/{story-id}-targets.txt      # Extended TDD — the targeted suite
│   ├── patterns/
│   └── diary/YYYY-MM/YYYY-MM-DD.md       # Auto-generated
├── infra/
├── scripts/
│   ├── hooks/*.sh                        # The six hook scripts
│   ├── run-targeted-tests.sh             # NEW — drives the multi-tier suite
│   ├── new-story.sh bootstrap-worktree.sh run-parallel.sh
│   └── pickup-ready-stories.sh           # Variant C/D/H always-on driver
├── tests/{unit,api,component,e2e,visual,ux-flow}/
├── tokens/{core,semantic,themes}/
├── generated/                            # Style Dictionary outputs
└── (your code)
```

---

# What "Done" Looks Like

1. Story moves to "Ready" in Linear → no human intervention → draft PR within 30–120 min, all targeted tests green (across whichever tiers Test Architect selected), Reviewer report attached, diary entries written.
2. Onlook visual edit → PR flows through six-tier CI.
3. Monday rollup: cycle time falling, per-tier coverage holding, flake rate <1%, `docs/diary/` complete.
4. Serena returns symbols in seconds; memory server returns verbatim excerpts for "what did we decide about X"; diary is greppable.
5. Human time is on spec quality and the interesting 20% of review.

Keep calibrating. Treat every friction as a rule, hook, or tier selection you haven't tuned yet.

---

_End of unified implementation guide._
