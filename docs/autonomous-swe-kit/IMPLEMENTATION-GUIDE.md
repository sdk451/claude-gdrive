# Autonomous Software Engineering — Implementation Guide

**Purpose:** Step-by-step setup of the autonomous engineering workflow described in `autonomous-swe-design.md` and the UX addendum, with memory and codebase context layered in per `MEMORY-AND-CONTEXT.md`.

**Audience:** A technically fluent human who has already read the design docs and is ready to execute.

**Time budget:** ~2 days of hands-on work to reach the end of Phase 5 (first real story running autonomously). Another 1–2 weeks of calibration to reach steady state.

**Supported paths:** this guide details the two most featureful setups:
- **Path A — Hybrid:** Cursor 3 + Claude Code. Best capability ceiling.
- **Path B — Pure Cursor:** No Claude Code. Single vendor.

For a full review of **all** implementation options — including Claude Code only (no Cursor), Cline, GitHub Copilot, Codex, Aider, OpenCode — **and their monthly cost estimates for light/medium/heavy usage**, read `COST-ANALYSIS.md` before choosing. That doc also covers the April 4 2026 Anthropic change that affects third-party tool access via subscriptions. Spoiler: **Claude Code only** (Path C in that doc) is often the best cost-to-capability ratio at $100–200/mo flat.

Both paths in this guide produce the same architecture. Phase 1 is path-specific; Phases 2 onward share the same flow with small callouts where commands differ.

**Platform notes:** Commands assume macOS/Linux. Windows users substitute the obvious equivalents (PowerShell for shell, `winget` or Scoop for Homebrew). Nothing in this guide is platform-specific in intent.

---

## Prerequisites

Before you start:

- **Git 2.30+** (for decent worktree support)
- **Node.js 20 LTS+** and **pnpm 9+** (if JS/TS stack; adjust for other stacks)
- **Python 3.11+** and **uv** (for Spec Kit, MemPalace, Serena)
- **jq** installed (`brew install jq`)
- **GitHub CLI** (`brew install gh`) and authenticated (`gh auth login`)
- **A GitHub repo** you control
- **A Linear workspace** you can add integrations to (free tier is fine)
- **Cursor 3** installed (download at cursor.com)
- **Path A only:** Anthropic API access (for Claude Code) or Claude Max subscription
- **A cloud account** where you can create dev/test/staging/prod isolates (AWS, GCP, Azure, Fly.io, Vercel, Cloudflare — whatever fits the stack)

Sanity-check once:
```bash
git --version && node --version && pnpm --version && python3 --version && jq --version
gh auth status
```

Install `uv` if missing:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## Path A — Hybrid (Cursor + Claude Code)

### A.1 Cursor 3

Download and install Cursor from https://cursor.com. Sign in. Enable:
- Settings → Features → **Agents Window** (`Cmd+Shift+P` → "Agents Window")
- Settings → Features → **Cloud Agents** (formerly Background Agents)
- Settings → Features → **Team Rules** (shared across your team)
- Settings → Features → **Automations**

### A.2 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude --version
claude auth login
claude -p "say hello"   # sanity check
```

### A.3 GitHub Spec Kit

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify --version
```

### A.4 Shared MCP servers — Linear, Serena, MemPalace

**Linear MCP (Cursor):** Settings → MCP → Add server → Linear → sign in via OAuth.

**Linear MCP (Claude Code):**
```bash
claude mcp add linear --transport http https://mcp.linear.app/mcp --scope user
```

**Serena MCP (Cursor):** Settings → MCP → Add server → paste JSON:
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

**Serena MCP (Claude Code):**
```bash
claude mcp add serena -- uvx --from "git+https://github.com/oraios/serena" serena start-mcp-server
```

**MemPalace:**
```bash
pip install mempalace   # or 'uv pip install mempalace' inside a venv
mempalace --version
```

Registration comes in Phase 2 after repo init.

### A.5 Design tooling — Onlook, Paper, Penpot

```bash
npm install -g @onlook/cli       # optional; desktop app also fine
# Paper Desktop: download from paper.design (free tier 100 MCP calls/wk)
# Penpot: use https://design.penpot.app (hosted, free, unlimited), or self-host via Docker
```

Paper MCP for Claude Code (launch Paper Desktop first):
```bash
claude mcp add paper --transport http http://127.0.0.1:29979/mcp --scope user
```

Paper MCP for Cursor: Settings → MCP → Add server → paste the same URL.

### A.6 Verify Path A

```bash
git --version && node --version && pnpm --version && python3 --version
gh auth status
claude --version
specify --version
mempalace --version
# Cursor is a GUI; just confirm it launches
```

Skip to **Phase 2**.

---

## Path B — Pure Cursor (no Claude Code)

You lose: Claude Code's 18-event hook system (Cursor's hooks are fewer and newer), headless `claude -p` invocations from scripts, Anthropic's plugin marketplace. You gain: simpler cost model (monthly subscription vs API per-token), one tool to learn, Cursor Design Mode for visual UI edits reducing dependence on Onlook.

### B.1 Cursor 3 + Cursor CLI

Download and install Cursor from https://cursor.com. Sign in.

Install the Cursor CLI (ships with Cursor 3, usable from shell scripts for parallel orchestration):
```bash
# The cursor-agent command is bundled with Cursor; confirm it is on PATH:
cursor-agent --version
# If missing, add Cursor's CLI bin dir to PATH — see Cursor docs for the current location on your OS.
```

Enable in Cursor: Settings → Features → **Agents Window**, **Cloud Agents**, **Team Rules**, **Automations**, **MCP Marketplace**.

### B.2 GitHub Spec Kit (Cursor flavour)

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify --version
# We will init with '--ai cursor' in Phase 2, so Spec Kit installs slash-commands in .cursor/commands/
```

### B.3 Shared MCP servers — Linear, Serena, MemPalace

All configured via Cursor's MCP Marketplace or JSON in Settings → MCP → Add server.

**Linear:** Settings → MCP → Add server → Linear → OAuth.

**Serena:**
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

**MemPalace:**
```bash
pip install mempalace
mempalace --version
```
Cursor MCP registration (after `mempalace init .` runs in the repo — Phase 2):
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

### B.4 Design tooling

```bash
npm install -g @onlook/cli
# Paper Desktop: download if desired
# Penpot: use hosted or Docker as in Path A
```

Paper MCP for Cursor: Settings → MCP → Add server → `http://127.0.0.1:29979/mcp`.

### B.5 Verify Path B

```bash
git --version && node --version && pnpm --version && python3 --version
gh auth status
cursor-agent --version
specify --version
mempalace --version
```

Continue to **Phase 2**.

---

## Phase 2 — Bootstrap the Repository (45 min)

### 2.1 Create the repo

```bash
mkdir my-project && cd my-project
git init
gh repo create my-project --private --source=. --remote=origin
```

### 2.2 Initialize Spec Kit

**Path A:**
```bash
specify init . --ai claude --ai-skills
```
Creates `.specify/`, `.claude/commands/`, `.claude/skills/`.

**Path B:**
```bash
specify init . --ai cursor --ai-skills
```
Creates `.specify/`, `.cursor/commands/`, Cursor-flavoured command files.

### 2.3 Create the directory skeleton (both paths)

```bash
# Docs tree
mkdir -p docs/{_seed,designs,tests,patterns,diary}
touch docs/{brief,prd,architecture,tech-stack,ux,ux-principles,constitution,backlog,design-system,test-strategy,environments,observability}.md

# Agent, rules, hooks trees — note both .claude and .cursor are created so personas can live in both
mkdir -p .claude/agents
mkdir -p .cursor/rules
mkdir -p .cursor/hooks
mkdir -p .cursor/commands

# Design system skeleton (filled in during Epic 0)
mkdir -p tokens/{core,semantic,themes}
mkdir -p components/{ui,primitives,blocks}
mkdir -p tests/{unit,api,component,e2e,visual,ux-flow}
mkdir -p scripts/hooks

# Agents root markdown alternative (works with every tool)
touch AGENTS.md

# MemPalace local index — gitignored
echo ".mempalace/" >> .gitignore
```

Commit:
```bash
git add -A && git commit -m "chore: initial project skeleton"
```

### 2.4 Install the persona files (both paths)

Copy all eight persona files into both `.claude/agents/` and `.cursor/commands/` (Cursor reads them as shared commands):

```bash
cp autonomous-swe-kit/agents/*.md .claude/agents/
cp autonomous-swe-kit/agents/*.md .cursor/commands/
```

**Path A verify:**
```bash
claude
> /agents
# Expect: analyst, architect, platform-engineer, test-architect, planner, implementer, reviewer, ux-engineer
```

**Path B verify:** In Cursor Agents Window, invoke `/planner` — Cursor should recognise the shared command.

### 2.5 Initialise MemPalace and mine seed context (both paths)

```bash
mempalace init .
# Optionally pre-load context — skip this on greenfield where nothing exists yet
# mempalace mine ./src --mode project   # once you have code
# mempalace mine ./docs --mode convos   # once you have docs
```

Register MemPalace MCP:
- **Path A:** `claude mcp add mempalace -- mempalace mcp` (and also in Cursor's MCP settings)
- **Path B:** Cursor's MCP settings only

### 2.6 Stub the rules files (both paths)

```bash
cat > .cursor/rules/00-index.mdc <<'EOF'
---
alwaysApply: true
description: Index — which rules apply when
---
# Rules index

- 01-constitution.mdc — always on; project non-negotiables (Architect)
- 02-architecture.mdc — always on; architecture summary (Architect)
- 03-tech-stack.mdc — always on; pinned versions, forbidden APIs (Architect)
- 04-infra.mdc — scoped to infra/; platform rules (Platform Engineer)
- 05-design-system.mdc — scoped to components/; UI rules (UX Engineer)
- 10-testing.mdc — scoped to tests/; testing rules (Test Architect)
- 20-planner.mdc — when Planner agent is active
- 21-implementer.mdc — when Implementer agent is active
- 22-reviewer.mdc — when Reviewer agent is active
- 40-serena.mdc — always on; tells agents to prefer Serena for code navigation
- 41-mempalace.mdc — always on; tells agents to consult and update MemPalace
- 30-personal.mdc — gitignored; per-developer preferences

Total "always apply" content must stay under ~2,000 tokens combined.
Use strong imperatives ("NEVER", "ALWAYS"). Weak preferences get ignored.
EOF

echo ".cursor/rules/30-personal.mdc" >> .gitignore

# Rule 40 — prefer Serena
cat > .cursor/rules/40-serena.mdc <<'EOF'
---
description: Use Serena for codebase navigation
alwaysApply: true
---
# Use Serena for codebase understanding

For any task requiring understanding of the codebase structure, PREFER Serena's
symbol-level tools (find_symbol, find_referencing_symbols, insert_after_symbol,
replace_symbol_body) over plain file reads and text search.

Serena is faster, uses fewer tokens, and is less error-prone than line-number-based
edits on files over ~200 lines.

Only fall back to Read/Grep when:
- The file is under ~100 lines
- You need to see a non-code file (JSON, YAML, markdown)
- Serena's language server does not cover the language
EOF

# Rule 41 — consult and update MemPalace
cat > .cursor/rules/41-mempalace.mdc <<'EOF'
---
description: Consult and update MemPalace for session memory
alwaysApply: true
---
# Memory via MemPalace

BEFORE responding about any person, project, or past event:
- Call mempalace_kg_query or mempalace_search FIRST.
- Never guess from training data — verify.

AT the start of your turn:
- Call mempalace_write_diary with agent={your-persona-name},
  entry="STARTED: <one-line task summary>"

AT the end of your turn (before exiting):
- Call mempalace_write_diary with agent={your-persona-name},
  entry="COMPLETED: <one-line outcome>, outputs: <paths>, next: <handoff>"

IF blocked mid-turn:
- Call mempalace_write_diary with agent={your-persona-name},
  entry="BLOCKED: <why>, need: <resolver>"
EOF
```

### 2.7 Install the hook scripts (both paths)

Create the five core guardrail hooks plus the diary-append hook:

```bash
cat > scripts/hooks/block-dangerous.sh <<'EOF'
#!/bin/bash
# PreToolUse(Bash) — block destructive commands
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
DANGER='rm\s+-rf\s+/|git push\s+.*--force.*\smain|git push\s+.*-f.*\smain|:(){:|:&};:'
if echo "$CMD" | grep -qE "$DANGER"; then
  jq -n --arg reason "Blocked destructive command: $CMD" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi
exit 0
EOF

cat > scripts/hooks/enforce-plan-mode.sh <<'EOF'
#!/bin/bash
# PreToolUse(Write|Edit) — require design.md before code writes
INPUT=$(cat)
BRANCH=$(git branch --show-current 2>/dev/null)
STORY_ID=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
if [ -z "$STORY_ID" ]; then exit 0; fi
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
case "$FILE" in
  docs/*|tests/*|*/docs/*|*/tests/*) exit 0 ;;
esac
if [ ! -f "docs/designs/${STORY_ID}.md" ]; then
  jq -n --arg reason "No docs/designs/${STORY_ID}.md exists. Run the Planner agent first." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi
exit 0
EOF

cat > scripts/hooks/enforce-tokens.sh <<'EOF'
#!/bin/bash
# PreToolUse(Write|Edit) — block hex/rgb/pixel literals outside tokens/
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
  jq -n --arg reason "Hex/rgb/pixel literals forbidden in component code. Use semantic tokens from tokens/semantic/ instead. See docs/design-system.md." \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
fi
exit 0
EOF

cat > scripts/hooks/vibecop-lint.sh <<'EOF'
#!/bin/bash
# PostToolUse(Write|Edit) — run vibecop + language linter + formatter
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[ -z "$FILE" ] || [ ! -f "$FILE" ] && exit 0
EXT="${FILE##*.}"
command -v vibecop >/dev/null && vibecop check "$FILE" 2>&1 | head -20
case "$EXT" in
  js|jsx|ts|tsx|json|css|md)
    npx prettier --write "$FILE" 2>/dev/null
    npx eslint --fix "$FILE" 2>/dev/null
    ;;
  py) ruff check --fix "$FILE" 2>/dev/null; ruff format "$FILE" 2>/dev/null ;;
  go) gofmt -w "$FILE" 2>/dev/null ;;
  rs) rustfmt "$FILE" 2>/dev/null ;;
esac
exit 0
EOF

cat > scripts/hooks/verify-completion-promise.sh <<'EOF'
#!/bin/bash
# Stop hook — require STORY_COMPLETE promise + green tests before exit
INPUT=$(cat)
LOOP=$(echo "$INPUT" | jq -r '.loop_count // 0')
MAX=30
if [ "$LOOP" -ge "$MAX" ]; then echo '{}'; exit 0; fi
SCRATCH=".cursor/scratchpad.md"
if grep -q "STORY_COMPLETE" "$SCRATCH" 2>/dev/null; then
  if pnpm test --run 2>/dev/null; then echo '{}'; exit 0; fi
fi
jq -n --arg msg "Iteration $((LOOP+1))/$MAX. Keep going. Emit <promise>STORY_COMPLETE</promise> in .cursor/scratchpad.md only when ALL tests pass." \
  '{followup_message: $msg}'
EOF

cat > scripts/hooks/diary-append.sh <<'EOF'
#!/bin/bash
# SessionStart + PostToolUse(Write|Edit|Bash) + Stop — append entries to docs/diary/
INPUT=$(cat)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MONTH=$(date -u +"%Y-%m")
TODAY=$(date -u +"%Y-%m-%d")
DIR="docs/diary/${MONTH}"
FILE="${DIR}/${TODAY}.md"
mkdir -p "$DIR"
[ ! -f "$FILE" ] && { echo "# Diary — $TODAY"; echo ""; } > "$FILE"
PERSONA="${CLAUDE_AGENT_NAME:-${CURSOR_AGENT_NAME:-unknown}}"
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .hook_event_name // "start"')
BRANCH=$(git branch --show-current 2>/dev/null || echo "-")
STORY=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')
case "$HOOK_EVENT" in
  SessionStart)
    echo "- ${NOW} | ${PERSONA} | [start] branch=${BRANCH} story=${STORY}" >> "$FILE" ;;
  PostToolUse)
    if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "Bash" ]]; then
      FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
      CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | head -c 80)
      SUMMARY="${FILE_PATH:-$CMD}"
      echo "- ${NOW} | ${PERSONA} | ${TOOL} | ${SUMMARY}" >> "$FILE"
    fi ;;
  Stop)
    echo "- ${NOW} | ${PERSONA} | [stop] branch=${BRANCH}" >> "$FILE" ;;
esac
exit 0
EOF

chmod +x scripts/hooks/*.sh
```

### 2.8 Register hooks

**Path A — Claude Code:** create `.claude/settings.json`:
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

**Path B — Cursor:** Cursor hooks live in `.cursor/hooks/` as TypeScript files and are referenced from `.cursor/settings.json`. Cursor's hook schema has been evolving — consult Cursor docs for the exact field names in your installed version. A minimal working example that shells out to the same scripts:

```bash
cat > .cursor/hooks/wrappers.ts <<'EOF'
// Thin wrappers that shell out to the battle-tested bash scripts.
// The JSON shape of stdin and stdout is kept compatible.
import { spawnSync } from "child_process";
import { readFileSync } from "fs";

function runBash(script: string) {
  const input = readFileSync(0, "utf-8");
  const res = spawnSync("bash", [script], { input, encoding: "utf-8" });
  if (res.stdout) process.stdout.write(res.stdout);
  process.exit(res.status ?? 0);
}

// Invoke with: node wrappers.ts <script-path>
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

Trust Cursor's current docs over this example if the schema has moved on. The idea — bash scripts handle logic, TS wrappers adapt I/O — is stable.

### 2.9 Commit

```bash
git add -A && git commit -m "chore: add persona files, rules, hooks, MemPalace + Serena wiring"
```

---

## Phase 3 — Run Ideation (1–3 hours)

This phase is human-led.

### 3.1 Drop seed material

Put any existing notes, research, competitor screenshots, etc. in `docs/_seed/`.

### 3.2 Run the Analyst

**Path A (Claude Code):**
```bash
claude
> Use the analyst agent to produce docs/brief.md. My starting idea is: [your pitch].
```

**Path B (Cursor):** Open the Agents Window. Invoke `/analyst` (Spec Kit-installed as a slash command) with the same prompt.

The Analyst will ask up to 5 questions. Answer, iterate, accept when satisfied.

### 3.3 Run the Architect

**Both paths:** invoke the Architect (via `claude` or Cursor Agents Window). Produce `prd.md`, `architecture.md`, `tech-stack.md`, `ux.md`, `constitution.md`, `backlog.md`.

Review each. Pay attention to version pinning in `tech-stack.md`, the non-negotiables in `constitution.md`, and story size in `backlog.md`.

### 3.4 Run the UX Engineer (Ideation mode)

Invoke the `ux-engineer` persona, ask for `docs/ux-principles.md` plus initial wireframes in Paper or Penpot.

### 3.5 Spec Kit consistency check

**Path A:**
```bash
claude
> /speckit.analyze
```

**Path B:** In Cursor, invoke `/speckit.analyze` from the Agents Window (Spec Kit installed slash commands in `.cursor/commands/`).

Fix anything flagged.

### 3.6 Import backlog to Linear

Invoke any agent with the prompt: "Using the linear MCP, create a Linear project for this codebase and import the epics/stories from docs/backlog.md."

Move Epic 0 to "Ready"; leave feature epics in "Backlog".

Commit:
```bash
git add -A && git commit -m "docs: ideation complete"
```

---

## Phase 4 — Run Epic 0 (4–8 hours)

Three agents in parallel. Same shape regardless of path.

### 4.1 Create three worktrees

```bash
REPO_DIR=$(pwd)
git worktree add ../$(basename $REPO_DIR).epic0-platform -b epic0/platform
git worktree add ../$(basename $REPO_DIR).epic0-testing -b epic0/testing
git worktree add ../$(basename $REPO_DIR).epic0-ux -b epic0/ux
```

### 4.2 Invoke each track

**Path A:** open three `claude` sessions, one per worktree, and invoke `platform-engineer`, `test-architect`, `ux-engineer` respectively.

**Path B:** Use Cursor Agents Window — spawn three parallel agents, each in its own worktree (Cursor 3 can do this natively from one window; point each at the corresponding branch).

Sample prompts (adapt per track):
- Platform: "Use the platform-engineer agent. Load docs/architecture.md and docs/tech-stack.md. Build Epic 0 platform deliverables and ship hello-world through dev → test → staging → prod."
- Testing: "Use the test-architect agent. Produce docs/test-strategy.md and scaffold the six-tier harness under tests/. Add .cursor/rules/10-testing.mdc."
- UX: "Use the ux-engineer agent. Build tokens/, run `pnpm dlx shadcn@latest init --base base-ui`, wrap primitives, install Storybook with addon-a11y, commit visual regression baseline, write docs/design-system.md."

### 4.3 Merge Epic 0

When each track finishes:
```bash
cd $REPO_DIR
gh pr list --state open
gh pr review <NUM> --approve
gh pr merge <NUM> --squash --delete-branch
git worktree remove ../$(basename $REPO_DIR).epic0-platform
git worktree remove ../$(basename $REPO_DIR).epic0-testing
git worktree remove ../$(basename $REPO_DIR).epic0-ux
```

### 4.4 Epic 0 exit gate

Before advancing, confirm:
- [ ] Hello-world deploys to dev, test, staging, prod
- [ ] All six test tiers execute in CI
- [ ] Coverage reports publish to PR comments
- [ ] Visual regression snapshots committed for primitive matrix
- [ ] Storybook runs locally and in CI
- [ ] All Epic 0 docs exist and are non-trivial
- [ ] `.cursor/rules/` populated (01–05, 10, 40, 41)
- [ ] Hooks verified by triggering each once
- [ ] `mempalace_search` returns relevant results
- [ ] Serena `find_symbol` works on the hello-world code
- [ ] `docs/diary/YYYY-MM/YYYY-MM-DD.md` exists with entries

Unchecked boxes poison every subsequent story. Do not proceed.

---

## Phase 5 — First Story With Full Human Oversight (2–4 hours)

Pick the smallest, lowest-risk story from your backlog.

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

**Both paths:** invoke `planner` agent with "Use the planner agent for Linear story AUTH-101."

Review `docs/designs/AUTH-101.md`. Push back on vague pieces.

If classified UI-new, run `ux-engineer` in UI-new mode first, then re-invoke Planner.

### 5.4 Run Test Architect

Invoke `test-architect` with "Use the test-architect agent for story AUTH-101. Produce docs/tests/AUTH-101.md and commit FAILING test files."

Verify: `pnpm test --run` shows red.

### 5.5 Run Implementer

Invoke `implementer` with "Use the implementer agent for story AUTH-101. Iterate until all tests pass and emit STORY_COMPLETE."

Watch the TDD loop. 5–20 iterations typical. The `verify-completion-promise.sh` hook blocks early exit.

### 5.6 Run Reviewer and open PR

```bash
gh pr create --draft --title "feat(AUTH-101): ..." --body "Closes AUTH-101"
PR=$(gh pr view --json number -q .number)
```

Invoke `reviewer` with "Use the reviewer agent on PR #$PR."

Address BLOCKING findings.

### 5.7 CI runs, human merges

```bash
gh pr review $PR --approve
gh pr merge $PR --squash --delete-branch
```

### 5.8 Calibrate

Critical step — before story 2:
- Which rules did agents ignore? Tighten.
- Where did Planner under-specify? Add examples.
- Which hook was missing? Write it now.
- Did any tier miss a real bug? Add to strategy.

Update personas, rules, hooks. Commit.

---

## Phase 6 — Scale to Parallel & Always-On (1–2 weeks)

### 6.1 Enable parallel execution

**Path A:** Cursor 3 Agents Window handles multiple parallel agents natively. OR use the bash orchestrator:

```bash
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
# Usage: ./scripts/run-parallel.sh AUTH-101 AUTH-102 AUTH-103
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    claude -p "Use the planner agent for Linear story ${STORY}, then test-architect, then implementer. Emit STORY_COMPLETE when done." \
           --max-budget-usd 10.00 \
           --output-format json > .agent-log.json) &
done
wait
echo "All agents done. Review with: gh pr list --state open"
EOF
chmod +x scripts/run-parallel.sh
```

**Path B (pure Cursor):** Use the Agents Window directly (drag-and-drop up to 8 parallel agents). OR script with `cursor-agent`:

```bash
cat > scripts/run-parallel.sh <<'EOF'
#!/bin/bash
# Usage: ./scripts/run-parallel.sh AUTH-101 AUTH-102 AUTH-103
REPO=$(basename $(pwd))
for STORY in "$@"; do
  git worktree add ../${REPO}.${STORY} -b feature/${STORY} &
done
wait
for STORY in "$@"; do
  (cd ../${REPO}.${STORY} && ./scripts/bootstrap-worktree.sh && \
    cursor-agent --prompt "Use the planner command for Linear story ${STORY}, then test-architect, then implementer. Emit STORY_COMPLETE when done." \
                 --autonomous \
                 --quality-gates "test,lint,type-check" \
                 --auto-commit \
                 --create-pr > .agent-log.json) &
done
wait
echo "All agents done. Review with: gh pr list --state open"
EOF
chmod +x scripts/run-parallel.sh
```

Set a hard budget per story regardless of path. Cloud-agent bills can explode — early users have reported $2,000 in 48 hours on Cursor, and $200/week on Claude Code Max. Track via `--max-budget-usd` (Path A) or Cursor's per-run compute limits (Path B).

### 6.2 Enable always-on pickup of Ready stories

**Both paths:** Cursor → Automations panel → New automation:
- **Trigger:** Linear webhook → status changed to "Ready"
- **Action:** spawn Planner → Test Architect → Implementer in a new worktree
- **Budget:** per-run cap ($5–20 depending on story size)

(Path A can additionally schedule a cron-driven `claude -p` run, but Cursor Automations are usually sufficient.)

### 6.3 Enable Playwright Test Agents

```bash
npx playwright init-agents --loop=claude   # or --loop=cursor if on Path B
```

Add GitHub Actions workflows that run Planner weekly, Generator on spec changes, Healer on failure.

### 6.4 Monday rollup

Invoke any agent:
> Add a Cursor Automation that runs every Monday at 9am. Summarise the past week: merged PRs, test pass rate, coverage trend, flaky tests, visual regression diffs. Also read docs/diary/ for that week's entries and summarise who did what. Post to Slack via the Slack MCP.

### 6.5 Onlook roundtrip verification

Pick any merged UI story. Open the running app in Onlook. Tweak spacing/colour. Confirm:
- Onlook creates a branch
- Edits map to correct `.tsx`
- Tailwind classes update, no hex literals
- PR opens, CI runs, Reviewer posts, visual regression passes

If that loop works, UX roundtrip is live.

---

## Phase 7 — Daily Operating Procedure

### Morning (10 min)

1. Agents Window → kanban glance
2. Review overnight draft PRs
3. Unblock anything `BLOCKED`
4. Check Monday rollup (Mondays)

### Story creation (30–60 min per epic)

1. Analyst + Architect draft stories into Linear
2. Move top N to "Ready"

### During the day

- Reviews, merges, occasional design/spec tweaks
- Onlook for visual polish

### Weekly (60 min)

1. Monday Slack rollup
2. Metrics: cycle time, flake rate, coverage
3. Top 3 friction points → tune personas/rules/hooks/diary

### Per model update

1. Canonical 5-story eval fixture
2. Compare output — regressions? Stay pinned.

---

## Phase 8 — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Planner writes code despite read-only | `disallowedTools` not set or wrong path format | Re-check frontmatter; verify with `/agents` |
| Hooks don't fire (Path A) | `.claude/settings.json` missing or script not executable | `chmod +x scripts/hooks/*.sh`; confirm via `claude --debug` |
| Hooks don't fire (Path B) | Cursor hook schema drifted | Read Cursor's latest hook docs; update `.cursor/settings.json` |
| Implementer exits without STORY_COMPLETE | Stop hook not blocking | Check `verify-completion-promise.sh` registered in Stop |
| Agents drift from architecture | Rules file too long | Cut always-apply content under ~2,000 tokens |
| Hex colours keep appearing | `enforce-tokens.sh` not matching | Test hook manually with a sample stdin JSON |
| Visual regression flakes | Animations/fonts | `animations: "disabled"`, pin Playwright browser, only `--update-snapshots` on intentional changes |
| Worktree collisions after merge | Branches deleted, worktrees not cleaned | Add `git worktree prune` to post-merge |
| Linear MCP loses auth | OAuth expired | Remove & re-add |
| Cost runs away | No per-run cap | `--max-budget-usd` (A) or Cursor compute limit (B); monitor via Cursor's Automations logs |
| Paper MCP hits 100/week | Heavy always-on use | Upgrade to Paper Pro, or restrict Paper MCP to Ideation-only |
| Reviewer approves everything | Severity too loose | Tighten persona — move patterns to BLOCKING |
| Serena MCP disconnected | `uvx` not on PATH | Install `uv`, restart Cursor/Claude Code |
| Serena empty for a language | LSP not installed | `uvx ... serena install-lsp <language>` |
| MemPalace `init` hangs | ChromaDB dependency | `pip install --upgrade chromadb pyyaml` |
| Diary entries missing for some personas | Soft prompt not honoured | Strengthen "Diarising (automatic)" in persona; diary-append hook is your safety net |
| Diary too noisy | Too many tool types | Tighten the `PostToolUse` matcher |

---

## Reference — File and Directory Map After Full Setup

```
my-project/
├── .claude/                          # Path A only — Claude Code
│   ├── agents/                       # 8 persona files
│   ├── commands/                     # Spec Kit slash commands
│   ├── skills/                       # Spec Kit + shadcn skills
│   └── settings.json                 # Hook registrations
├── .cursor/                          # Both paths
│   ├── rules/
│   │   ├── 00-index.mdc
│   │   ├── 01-constitution.mdc
│   │   ├── 02-architecture.mdc
│   │   ├── 03-tech-stack.mdc
│   │   ├── 04-infra.mdc
│   │   ├── 05-design-system.mdc
│   │   ├── 10-testing.mdc
│   │   ├── 20-planner.mdc
│   │   ├── 21-implementer.mdc
│   │   ├── 22-reviewer.mdc
│   │   ├── 40-serena.mdc
│   │   ├── 41-mempalace.mdc
│   │   └── 30-personal.mdc           # gitignored
│   ├── hooks/                        # Path B hook wrappers
│   ├── commands/                     # Path B — Spec Kit + personas as shared commands
│   └── settings.json                 # Path B hook registrations
├── .specify/                         # Spec Kit templates
├── .mempalace/                       # MemPalace local index — gitignored
├── AGENTS.md                         # Plain-markdown agent instructions
├── components/
│   ├── ui/                           # Raw shadcn primitives
│   ├── primitives/                   # Project-wrapped primitives
│   └── blocks/                       # Product compositions
├── docs/
│   ├── _seed/
│   ├── brief.md                      # Analyst
│   ├── prd.md                        # Architect
│   ├── architecture.md
│   ├── tech-stack.md
│   ├── ux.md
│   ├── ux-principles.md              # UX Engineer (ideation)
│   ├── constitution.md
│   ├── backlog.md
│   ├── design-system.md              # UX Engineer (Epic 0)
│   ├── test-strategy.md              # Test Architect (Epic 0)
│   ├── environments.md               # Platform Engineer (Epic 0)
│   ├── observability.md              # Platform Engineer (Epic 0)
│   ├── designs/{story-id}.md         # Per-story Planner output
│   ├── tests/{story-id}.md           # Per-story Test Architect output
│   ├── patterns/                     # Design patterns catalogue
│   └── diary/                        # Auto-generated by diary-append hook
│       └── YYYY-MM/YYYY-MM-DD.md
├── infra/                            # IaC (Platform Engineer)
├── scripts/
│   ├── hooks/                        # Hook shell scripts
│   │   ├── block-dangerous.sh
│   │   ├── enforce-plan-mode.sh
│   │   ├── enforce-tokens.sh
│   │   ├── vibecop-lint.sh
│   │   ├── verify-completion-promise.sh
│   │   └── diary-append.sh
│   ├── new-story.sh
│   ├── bootstrap-worktree.sh
│   └── run-parallel.sh
├── tests/
│   ├── unit/  api/  component/  e2e/  visual/  ux-flow/
├── tokens/                           # DTCG v1
│   ├── core/  semantic/  themes/
├── generated/                        # Style Dictionary outputs
├── .github/workflows/                # CI/CD (Platform Engineer)
└── (your code)
```

---

## What "Done" Looks Like

1. Story moves to "Ready" in Linear → with no human intervention → draft PR ~30–120 minutes later, tests green, Reviewer report attached, diary entries written.
2. Onlook visual edit → commit → PR flows through same pipeline.
3. Monday rollup shows cycle time falling, coverage above targets, flake rate <1%.
4. Serena query finishes in seconds and returns the exact symbol; MemPalace search returns the right verbatim excerpt for "what did we decide about X"; `docs/diary/` has complete coverage of the week.
5. Human time is on spec quality and the interesting 20% of review.

Keep calibrating. Treat every friction as a rule or hook you haven't written yet.

---

*End of implementation guide.*
