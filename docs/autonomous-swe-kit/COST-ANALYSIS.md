# Cost Analysis — Implementation Options for the Autonomous SWE Workflow

**Companion to** `autonomous-swe-design.md`, `IMPLEMENTATION-GUIDE.md`, and `MEMORY-AND-CONTEXT.md`. This document exists because Cursor's cloud agents can be very expensive in practice (reports of $2,000 in 48 hours, $1,800/month — see §1), and because several viable alternatives are either dramatically cheaper or structurally different in their cost model.

**Central question:** How does each option actually run the autonomous implementation phase — the Planner → Test Architect → Implementer loop where the Implementer iterates for 5–30 cycles until tests pass — and what does that cost in practice?

**Date of pricing:** April 2026. Pricing changes frequently. Verify against vendor pricing pages before committing.

---

## 1. Why cost matters more than the sticker price

Every AI coding tool has a marketing price and a real price. Cursor Pro is $20/month — *and* early adopters have reported $2,000 bills in 48 hours on cloud agents. Claude Code Max is $200/month flat — *and* the rate-limit windows can be exhausted in under an hour during intense sessions. Cline is free — *and* a heavy user running Sonnet 4.6 autonomously can burn through $500/month on API tokens.

The sticker price tells you how the vendor wants to be paid. The real price is determined by:

- **Model mix.** All-Opus sessions cost 5x more than Haiku/Sonnet/Opus mix for the same work. Difference between cheapest and most expensive current models is ~50x per token.
- **Iteration depth.** A TDD loop at 30 iterations burns 30x the tokens of a 1-shot. Loops without a max-iterations cap can run indefinitely.
- **Context bloat.** Agents reading full files instead of using LSP-backed symbol navigation (Serena) consume 5–10x the tokens for the same understanding.
- **Cache vs no-cache.** ~90% of tokens in heavy Claude Code sessions are cache reads. Subscription plans fold cache reads into the flat rate; API pricing charges (discounted) per cache hit.
- **Parallelism.** 5 parallel agents = 5x tokens per wall-clock hour.

Every cost number below assumes the discipline in the main design doc: per-story budget caps, model routing, max-iterations, Serena for context, hooks blocking runaway behaviour. Without those, any option can run away.

---

## 2. What "autonomous implementation" needs from the tool

Before comparing costs, be concrete about what the tool has to do for the Phase-5-onward story loop:

1. **Spawn an agent in an isolated worktree.** Needs git worktree awareness or the ability to be scripted around it.
2. **Read personas and rules.** Needs to respect `.claude/agents/*.md`, `.cursor/commands/*.md`, or `AGENTS.md` — or have an equivalent.
3. **Honour hooks / guardrails.** Needs pre-tool, post-tool, and stop hooks (or equivalent) so Planner can't write code, tokens are enforced, completion promise is verified.
4. **Call MCP servers.** Linear (stories), Serena (codebase context), MemPalace (memory and diary), Playwright (test agents), GitHub.
5. **Run long loops.** The Implementer iterates until green — needs either an autonomous iterate-until-done mode or a way to script the loop externally.
6. **Commit and open PRs.** Conventional commits, branch push, draft PR.
7. **Respect budget limits.** Hard cap per run to prevent runaway cost.

Any option that can't cover 1–7 either needs a lot of glue code or a different assignment.

---

## 3. Option-by-option review

### 3.1 Path A — Cursor + Claude Code hybrid

**Cost model:** Cursor subscription ($20–200/mo) + Claude Code subscription or API.

**Pricing, April 2026:**
| Plan | Monthly | Included | Notes |
|---|---|---|---|
| Cursor Pro | $20 ($16 annual) | $20 credit pool (~225 Sonnet requests), unlimited Tab, MCPs, skills, hooks, cloud agents | Cloud agents bill separately; MAX-mode adds 20% surcharge |
| Cursor Pro+ | $60 | 3x Pro credits ($60 pool) | Recommended for daily agent users |
| Cursor Ultra | $200 | 20x Pro credits ($400 pool) | For full-day AI-native dev |
| Cursor Teams | $40/seat | Same as Pro + admin | Pooled usage on Enterprise only |
| Claude Code (Pro) | $20 | Shared pool with Claude chat, ~5-hour windows | Often insufficient for heavy Claude Code |
| Claude Code Max 5x | $100 | ~88K tokens per 5-hr window | Typical sweet spot for daily Claude Code |
| Claude Code Max 20x | $200 | ~220K tokens per 5-hr window | Power users; Opus unlimited in practice |
| Claude Code API (Sonnet 4.6) | Pay-per-token | $3/MTok input, $15/MTok output, $0.30/MTok cache read | No subscription, variable cost |

**How it runs the autonomous implementation phase:**
- Cursor's Agents Window handles orchestration, worktree creation, and PR opening. Hooks are configurable but less mature than Claude Code's.
- Claude Code handles headless, scripted runs. `claude -p "..." --max-budget-usd 10` in a cron or Linear webhook. 18-event hook system is the most complete of any option.
- Both can share the same MCP servers (Linear, Serena, MemPalace). Both respect the persona files with minor path differences.
- In practice: use Cursor for interactive/visual work (Analyst, Architect, UX Engineer, PR review) and Claude Code for the autonomous inner loop (Planner → Test Architect → Implementer → Reviewer).

**Real-world cost estimates (one developer, monthly):**
- **Light use** (2–3 stories/week, well-sized, good hooks): Cursor Pro + Claude Code Max 5x = $120/mo. Observed overages: $0–30.
- **Medium use** (1–2 stories/day): Cursor Pro+ + Claude Code Max 20x = $260/mo. Observed overages: $50–200 if cloud agents used.
- **Heavy use** (parallel agents throughout the day): Cursor Ultra + Claude Code Max 20x = $400/mo + Cursor cloud-agent overages. Real reports range $500–2,000/mo.

**Critical warning — April 4 2026 Anthropic announcement:** Claude subscriptions no longer work with third-party tools (Cline, Cursor, Windsurf, OpenClaw, etc). Cursor uses its own Anthropic inference billing, so this affects users who were authenticating Cursor with a personal Claude subscription. You now need Cursor's bundled billing *or* an Anthropic API key for non-Cursor tools.

**Verdict:** Best capability ceiling for every phase of the workflow. Cost ceiling is high and variable unless you discipline cloud-agent use hard. Recommended for experienced operators who will set budget caps on every Automation.

---

### 3.2 Path B — Pure Cursor

**Cost model:** Cursor subscription only.

**Pricing:** as above. The critical distinction for this path is whether you enable **Cloud Agents** or stay **local-only**. Each has a different cost profile and a different story for running the autonomous implementation phase.

#### 3.2a — Pure Cursor, local-only (Cloud Agents OFF)

**Setup:** Cursor Pro or Pro+. Cloud Agents disabled in Settings → Features. Agents Window used only for local-machine agent runs. Parallel runs scripted via `cursor-agent` CLI in local git worktrees.

**How it runs the autonomous implementation phase:**
- Agents Window spawns a local agent per worktree. The agent runs in a process on your laptop, not a cloud VM.
- `cursor-agent --prompt "..."` invoked from a shell script handles headless / scripted runs. Works fine for cron or Linear-webhook triggers that run on your own machine or a self-hosted runner.
- Hooks via `.cursor/hooks/` + `.cursor/settings.json`.
- MCP servers: Linear, Serena, MemPalace — identical setup to the cloud-on variant.
- Parallelism is bounded by your laptop's CPU/RAM — realistically 2–4 parallel agents. More than that and latency kills throughput.

**Can it run the full autonomous loop?** Yes, cleanly. Planner → Test Architect → Implementer → Reviewer all work. The constraint is wall-clock throughput, not capability. A 30-iteration TDD loop on a local agent takes the same model time as a cloud agent; you just lose the ability to walk away while 8 agents run in parallel on cloud VMs.

**Real-world cost estimates (one developer, monthly):**
- **Light use** (10 stories/mo, serial): Pro $20. The credit pool is $20; typical consumption 30–70% depending on model mix. Sonnet-heavy runs lean into Pro+.
- **Medium use** (40 stories/mo, 2–4 parallel locally): Pro+ $60. Credit pool is $60; on-demand overage $10–40 likely.
- **Heavy use** (80+ stories/mo, parallel autonomous all day): Ultra $200 or Pro+ $60 plus $100–300 overage.

**Cost ceiling:** effectively the subscription + overages. Because there's no per-minute VM billing, the $2,000-weekend horror story cannot happen. Set Settings → Usage → hard spend limit at 2x your subscription to be safe.

**Verdict:** **Predictable. Boring. Works.** The local-only mode is actually the best Cursor configuration for cost-sensitive autonomous engineering. You give up parallel cloud throughput but gain cost certainty.

#### 3.2b — Pure Cursor, cloud-enabled (Cloud Agents ON)

**Setup:** Cursor Pro+ or Ultra. Cloud Agents enabled. Agents run in isolated cloud VMs with full dev environments — 8+ parallel agents possible from one Agents Window, each building a different feature with its own worktree, running tests, taking screenshots, producing a PR.

**How it runs the autonomous implementation phase:**
- Identical agent logic to local-only, but execution happens in Cursor's cloud infrastructure. Huge wall-clock throughput advantage — 8 stories can run simultaneously without your laptop lifting a finger.
- Cursor Automations trigger on Linear "Ready" → spawn cloud agent → run Planner → Test Architect → Implementer → open PR. Fully hands-off.
- Cloud agents require **MAX mode** (a bigger context window + longer reasoning), which adds a 20% surcharge on every run.
- Billing: cloud agent usage is **separate** from your subscription credit pool. Runs bill per-minute of VM time plus per-token model use.

**Can it run the full autonomous loop?** Yes, and this is the configuration where Cursor genuinely differentiates from Claude Code — the parallelism and the Automations-on-Linear-status trigger are both stronger than what Claude Code offers out of the box (though Claude Code can be scripted to match).

**Real-world cost estimates (one developer, monthly):**
- **Light use** (10 stories/mo, 1–2 cloud agents, careful budget caps): Pro+ $60 + $30–100 cloud-agent overage = $90–160.
- **Medium use** (40 stories/mo, 3–4 parallel cloud agents): Pro+ $60 or Ultra $200 + $150–500 cloud-agent overage = $210–700.
- **Heavy use** (80+ stories/mo, 8 parallel cloud agents always-on): Ultra $200 + $500–2,000+ cloud-agent overage. Documented worst case: $2,000 in 48 hours (HN reports).

**The reason costs explode:** when your agents are in the cloud, *you're not sitting there watching them*. A runaway loop that takes 6 hours on your laptop (and is obvious) takes 6 hours on the cloud and you don't notice. Multiply by 8 parallel VMs. Multiply by MAX mode's 20% surcharge. Multiply by overnight/weekend. Bills of $1,000+ in a weekend come from unattended cloud agents that never emitted STORY_COMPLETE.

**Non-negotiable cost controls:**
1. Set per-run budget cap in every Automation ($5–20 depending on story size).
2. Settings → Usage → hard spend limit. If you're not willing to pay $X, Cursor will refuse to start new agents at $X.
3. Put STORY_COMPLETE verification as a Stop hook. If the agent doesn't emit it, the agent should surface a BLOCKED state and open a draft PR for human review, not keep retrying indefinitely.
4. Max-iterations cap per agent (25 is the right ceiling).
5. Monitor the Automations dashboard daily for the first month. Unattended spending is only safe once you've verified the cost pattern for your team.

**Verdict:** **High capability, high cost ceiling.** Cloud agents genuinely speed up an always-on Linear-triggered workflow. Whether the speed is worth the cost depends on (a) how many stories/month you ship, and (b) how disciplined you are with caps. For teams: potentially great ROI when stories ship reliably. For solo developers: usually slower+cheaper local-only is the better default, with Cloud Agents turned on only for specific weekend-length batches.

#### 3.2 summary

| Variant | Typical monthly | Parallelism | Setup complexity | Cost ceiling | Who it's for |
|---|---|---|---|---|---|
| B-local (Cloud OFF) | $20–60 + minor overage | 2–4 agents | Simpler | ~$150 | Cost-conscious solo dev who wants a visual IDE |
| B-cloud (Cloud ON) | $90–$2,000+ | 8+ agents | More moving parts | Unbounded unless capped | Teams with real Linear velocity + disciplined caps |

**The important correction** to the previous version of this doc: Pure Cursor is not uniformly expensive or uniformly predictable. Local-only Pure Cursor is **the cheapest visual-IDE path** that still runs the autonomous loop. Cloud-enabled Pure Cursor is the highest-throughput path but also the most expensive. Pick the variant deliberately.

---

### 3.3 Path C — Claude Code only (no Cursor)

**Cost model:** Claude Code subscription or API. IDE is VS Code or terminal-only.

**Why this exists:** Claude Code leads on autonomous capability — Agent Teams, sub-agents with coordinated task lists, 18-event hook system, auto-context-compaction, strongest SWE-bench score (80.8%). You don't need Cursor for the implementation phase. For interactive editing, Claude Code's VS Code extension + JetBrains plugin + browser IDE (claude.ai/code) cover most needs.

**Pricing:** same as in §3.1 (Pro $20, Max 5x $100, Max 20x $200, API pay-per-token).

**How it runs the autonomous implementation phase:**
- **Story trigger:** GitHub Actions workflow listening on Linear webhook, OR a Linear-native integration, OR a cron-driven `claude -p` runner.
- **Worktree management:** shell script (`scripts/run-parallel.sh` from IMPLEMENTATION-GUIDE.md).
- **Agent orchestration:** Claude Code's sub-agents natively — Planner spawns Test Architect spawns Implementer, each with its own context and task list. Agent Teams coordinate via shared task-list MCP.
- **Loop control:** built-in max-iterations + the `verify-completion-promise.sh` Stop hook.
- **PR open:** `gh pr create` in the Implementer's final step.
- **Review:** Reviewer agent invoked on PR number.

**Real-world cost estimates (one developer, monthly):**
- **Light use** (2–5 stories/week): Claude Code Pro $20. Works if stories are small and parallel is rare. Expect occasional waits during reset windows.
- **Medium use** (1–2 stories/day, single-file scope): Max 5x $100. This is the sweet spot. Shared case study: 8 months heavy use = 10B tokens = $15K at API rates vs $800 on Max = 93% savings.
- **Heavy use** (parallel agents, full-day autonomous): Max 20x $200. Peak-month API-equivalent would be $5,623 — Max 20x still fixed at $200.
- **API pay-per-token** (if you can't or won't subscribe): $200–2,000/mo depending on volume. The math: a 30-iteration TDD story with mixed Opus/Sonnet calls and ~500K total tokens ≈ $5–15/story. 50 stories/month ≈ $250–750.

**Strengths:**
- Most mature agent-orchestration primitives (Agent Teams, subagents, shared task lists).
- Hook system is the deepest — every hook pattern in the IMPLEMENTATION-GUIDE works out-of-the-box.
- Flat-rate subscription is the most predictable cost model. "90% of Claude Code users spend under $12/day" — that's a $360/mo API ceiling; Max 20x caps it at $200.
- Runs in terminal, VS Code, JetBrains, desktop app, or claude.ai/code browser. Picks up team MCP config across environments.

**Weaknesses:**
- No GUI for non-terminal users (though VS Code extension + browser IDE narrow this gap considerably).
- 5-hour reset windows can interrupt flow during peak sessions even on Max 20x.
- Single vendor lock-in (mitigated by personas and hooks being portable markdown/bash).
- No visual design mode; pair with Onlook for UI roundtrip.

**Verdict:** The best cost/capability ratio for a disciplined autonomous workflow. **Most predictable cost model of any option** (subscription flat-rate). Recommended if you're willing to operate from terminal + VS Code and don't need Cursor's visual chat/composer. **This is the option I'd pick for cost-sensitive operators who still want full agentic capability.**

---

### 3.4 Path D — Cline + BYO API key

**Cost model:** Cline is free (Apache 2.0 VS Code extension). You bring your own API key — Anthropic, OpenAI, Gemini, or local Ollama. Pay for model tokens only.

**Why this exists:** 5M+ installs, open-source, explicit-approval model (human-in-the-loop per file change or terminal command), works with any LLM, v3.58 (Feb 2026) added native subagents for parallel execution. Cline Kanban gives visual orchestration across multiple agents.

**Pricing:**
- Cline extension: **$0**.
- Typical spend on Sonnet 4.6 via API for moderate use: **$5–15/month**.
- Heavy autonomous use (daily TDD loops): **$100–500/month** depending on model mix.
- Cline with local Ollama (Llama, DeepSeek, Qwen): **$0** for the model, electricity only. Quality gap vs frontier models is real but narrowing.

**How it runs the autonomous implementation phase:**
- **Story trigger:** manual in Cline UI, or via Cline CLI `cline run --story AUTH-101`, or a GitHub Actions/cron webhook.
- **Worktree management:** shell script. Cline doesn't ship its own worktree orchestrator but works fine in VS Code's multi-workspace mode.
- **Agent orchestration:** native subagents since v3.58. Less mature than Claude Code's Agent Teams but functional.
- **Loop control:** max-iterations configurable. No native equivalent to the verify-completion-promise Stop hook — you implement it as an external watcher script.
- **Approval model:** default is explicit approval per action, which slows autonomous loops. For headless operation, set `auto_approve: true` per workflow, which waives the approval requirement for that session. Keep this gated by a strict rules file.
- **MCP servers:** first-class. Linear, Serena, MemPalace all work.

**Critical note — April 4 2026 Anthropic change:** Cline users who authenticated via a personal Claude subscription lost that access. Cline now requires either an Anthropic API key directly (API pay-per-token billing) or routing through OpenRouter, or using a non-Anthropic model. This shifts Cline from "$0 plus free Claude subscription" to "API rates" for Anthropic-first users.

**Real-world cost estimates (one developer, monthly):**
- **Light use** (5 stories/week, small stories, Sonnet 4.6): **$20–50**.
- **Medium use** (1 story/day, Opus for Planner, Sonnet for Implementer, Haiku for trivia): **$100–200**.
- **Heavy use** (parallel autonomous): **$300–800**. Can exceed Claude Code Max 20x ($200) at this tier.
- **Local models (Ollama with Qwen 2.5 Coder 32B or DeepSeek V3)**: **$0**. Throughput and quality will be lower; reasonable for simple stories.

**Strengths:**
- Transparent token visibility — Cline shows per-task cost in real time.
- Model flexibility — can route Planner to Opus, Implementer to Sonnet, Test Architect to Haiku. Right model for right job is the single biggest cost lever (50x difference between cheapest and most expensive).
- Explicit-approval mode is safer for regulated codebases or air-gapped environments.
- Local model support is unique among the options — true zero-cost operation possible.
- No vendor lock-in.

**Weaknesses:**
- Subagent coordination weaker than Claude Code's Agent Teams.
- Hook system is less developed; several of the design's hooks (e.g. the completion-promise stop hook) need custom wrappers.
- Explicit approval by default slows autonomous loops; configuring full auto-approve loses the safety benefit.
- API-rate pay-per-token can rack up to more than a Claude Code Max subscription for heavy users — run the math before assuming Cline is always cheaper.

**Verdict:** Best option for **cost-sensitive teams with strong model-routing discipline** and for **air-gapped or privacy-sensitive** work (Ollama local). Easy to start cheap ($0 install + ~$20/mo API) and scale up. Becomes expensive above heavy daily autonomous use — at that point Claude Code Max 20x is cheaper and faster.

---

### 3.5 Path E — GitHub Copilot (coding-agent variant)

**Cost model:** Subscription.

**Pricing (April 2026):**
| Plan | Monthly | Premium requests/mo | Coding agent? |
|---|---|---|---|
| Copilot Free | $0 | 50 | No |
| Copilot Pro | $10 | 300 | Yes |
| Copilot Pro+ | $39 | 1,500 | Yes (all models incl. Opus) |
| Copilot Business | $19/user | 300 | Yes |
| Copilot Enterprise | $39/user + $21 Enterprise Cloud prereq | 1,000 | Yes (plus custom models) |
| Overage | — | $0.04 per extra premium request | — |

**Key 2026 updates:**
- **Coding Agent** (generally available, Pro tier and up): assign a GitHub Issue to `@github-copilot`, the agent spins up a GitHub Actions runner, clones the repo, writes code, runs tests, opens a PR. Asynchronous — you assign the issue and come back later to find a ready PR. **This is the part of Copilot that can genuinely run the autonomous implementation phase.**
- **Agent Mode** in VS Code / JetBrains: interactive multi-step task mode, similar to Cursor's agent.
- Each coding-agent session uses **one premium request** plus GitHub Actions minutes (from your account's free tier, then billed).
- **Claude Opus 4.6 available** via Copilot for Pro+ and above — so the model ceiling is no longer a differentiator against Cursor/Claude Code.
- Premium requests for coding agent are tracked in a **dedicated SKU** from Nov 2025, so you can budget-cap agent spend separately from chat.

**How it runs the autonomous implementation phase:**
- **Story trigger:** Linear → GitHub Issues bridge (via Linear's GitHub integration or a lightweight GitHub Action), OR assign directly from GitHub. Copilot Coding Agent starts automatically on assignment.
- **Worktree management:** Copilot's GitHub Actions runner creates an isolated environment per task. No manual worktree setup required.
- **Persona enforcement:** via `.github/copilot-instructions.md` (repo-level custom instructions) and per-path `.github/instructions/*.instructions.md` (glob-scoped instructions). **This is where your Planner / Test Architect / Implementer / Reviewer personas get installed.** Copilot reads them automatically.
- **Rules:** same `.github/instructions/` mechanism with file-glob scoping is the equivalent of Cursor's `.cursor/rules/`.
- **Hooks:** no direct Claude-Code-style 18-event hooks, but you get:
  - **Custom Agents**: YAML files declaring a system prompt + allowed tools for sub-tasks (equivalent to Claude Code subagents, less mature)
  - **GitHub Actions pre-checks**: run your own workflow on the PR before merging — this is where `enforce-plan-mode.sh`, `enforce-tokens.sh`, `verify-completion-promise.sh` move to, as GitHub Actions jobs
  - **Branch protection rules**: enforce PR review, require passing checks, block direct-to-main
- **MCP servers:** Copilot supports MCP. Linear, Serena, MemPalace, mcp-memory-service all work once registered in the VS Code Copilot settings. Coding-agent-side MCP requires the server to be reachable from the GitHub Actions runner — easiest for hosted MCPs (Linear); local MCPs (Serena indexing the repo, MemPalace with a local ChromaDB) need a self-hosted runner or a remote deployment of the MCP.
- **Loop control:** Coding agent manages its own iteration loop. No user-configurable max-iterations in the current release; you control budget via the premium-request allowance instead.
- **PR open:** automatic. The agent opens a PR when it believes the task is done.
- **Reviewer:** Copilot's **Code Review** feature (GA March 2026) can act as the Reviewer persona on PR open, with line-by-line feedback and agentic project context. Findings can be routed back to the coding agent for a fix PR.

**Can it run the full autonomous loop?** Yes, *with caveats*. The issue-to-PR model is naturally aligned with the Planner → Implementer → PR flow. The weakness is the read-only Planner constraint: Copilot Coding Agent doesn't have a first-class way to run a read-only "design-only" sub-agent before writing code. Workaround: run Planner as a separate Agent Mode invocation in VS Code (or a GitHub Actions workflow that uses a Custom Agent with tool access restricted to read + write-to-docs-only), have it commit the design doc, then have the coding agent pick up the issue only once the design doc exists (enforced by a GitHub Actions check on the issue).

**Real-world cost estimates (one developer, monthly):**
- **Light use** (10 stories/mo, Copilot Pro): 10–30 premium requests consumed by agent mode + coding agent + code review. Well inside Pro's 300 allowance. **$10/mo.**
- **Medium use** (40 stories/mo, Copilot Pro+): 100–250 premium requests. Inside Pro+'s 1,500 allowance. **$39/mo.** Plus: GitHub Actions minutes likely exceed the free-tier 2,000 min/mo — budget ~$5–20/mo for extra minutes.
- **Heavy use** (80+ stories/mo, parallel coding-agent tasks): Pro+ at $39 + 500–1,500 overage requests × $0.04 = $20–60 overage + $20–80 Actions minutes = **$80–180/mo.** Still by a wide margin the cheapest option at this tier.

**Strengths:**
- **Cheapest predictable path to autonomous PR creation.** $10–39/mo flat plus small overages.
- **Unique in its GitHub-native workflow.** Issues-to-PR via @github-copilot assignment is the most natural autonomous trigger of any option.
- **IP indemnity** (Business and Enterprise) — no other option offers this.
- **Works in every major IDE** (VS Code, JetBrains, Eclipse, Neovim, Xcode). Cursor and Claude Code are narrower.
- **Claude Opus 4.6 + GPT-5.x + Gemini all available** on Pro+ and above — so model choice is comparable to Cursor's.

**Weaknesses:**
- Hook system less developed than Claude Code. You move guardrails into GitHub Actions.
- Max-iterations not user-configurable; you control budget via premium-request allowance.
- Local MCP servers (Serena on your repo, MemPalace with local state) need self-hosted GitHub Actions runners or remote MCP deployments. More setup work.
- Custom agent mode less mature than Claude Code's Agent Teams or Cursor's multi-agent Agents Window.
- Note: Starting April 20, 2026, **new sign-ups for Pro / Pro+ are temporarily paused** per GitHub's docs. Existing users continue unaffected; Business and Enterprise sign-ups still open.

**Verdict:** **Best cost-to-capability for autonomous PR creation on GitHub-native teams.** $10–39/mo flat is unbeatable. If you already live in GitHub Issues + PRs and don't mind moving guardrails into GitHub Actions, this is a strong choice. Recommended as a serious contender alongside Claude Code only (Path C). **Recommended especially for teams** where the Business plan's $19/seat is cost-competitive with any individual subscription and adds IP indemnity.

---

### 3.6 Path E2 — Microsoft 365 Copilot for Business (different product)

**What this is:** Easy to confuse with GitHub Copilot. Microsoft 365 Copilot is the **office-productivity AI** — integrations in Outlook, Word, Excel, PowerPoint, Teams, SharePoint — not a coding agent. Copilot Studio is the platform for building custom agents on top of it.

**Pricing (April 2026):**
| Product | Monthly | What it covers |
|---|---|---|
| M365 Copilot Chat | $0 (with eligible M365 plan) | Web-grounded AI chat |
| M365 Copilot (add-on) | $30/user | Full M365 integration + Work IQ |
| M365 Copilot Business (SMB) | $21/user ($18 promo until Mar 31, 2026) | M365 Copilot for small-mid business |
| M365 E7 (enterprise) | $99/user | Launched May 1 2026. Includes **Cowork** autonomous agent (built on Claude) |
| Copilot Studio (standalone) | $200 per 25,000 Copilot Credits | For external-facing agents |
| Azure consumption | Variable | Required for running Copilot Studio agents |

**How it runs the autonomous implementation phase — can it?**

**Mostly no.** Microsoft 365 Copilot is not designed for software engineering in the sense this workflow requires. Specifically:

- **No worktree/repo awareness.** Copilot Studio agents can call external APIs and MCP servers, but there's no first-class "open this git worktree, iterate on tests until green, commit" primitive.
- **No Serena/MemPalace-equivalent default stack.** You'd wire up MCP yourself; Work IQ (the Copilot knowledge layer) is tuned for documents and business data, not code symbols.
- **No 18-event hook system.** Governance happens via Purview / DLP / admin policies, not per-tool pre/post hooks.
- **Cowork** (the new E7 autonomous agent) **is office-workflow-focused** — drafting emails, moving items across calendars, multi-step SharePoint-and-Teams orchestration. Not source-code-focused.

**The only genuinely interesting coding-adjacent path:** **Copilot Studio + GitHub Copilot Coding Agent combined.** You build a Copilot Studio agent that listens for a business trigger (e.g. a SharePoint status change, a Teams message), then calls the GitHub Copilot Coding Agent via its GitHub Actions API to create an issue and assign it to `@github-copilot`. This works — it routes your org's business triggers into the engineering autonomous loop — but the actual autonomous implementation happens in GitHub Copilot (Path E), not in Microsoft 365 Copilot.

**Real-world cost estimates:** Not applicable as a standalone autonomous coding path. If you're buying M365 Copilot Business anyway ($21/user) for your org's productivity, you get "for free" the ability to build business-process triggers that feed into GitHub Copilot's coding agent. Marginal cost for the coding workflow: **$0** on top of what you were already paying.

**Verdict:** **Not a coding-agent replacement for Paths A–E.** Useful only if your organisation has already licensed M365 Copilot and wants to bridge business events to engineering workflows via Copilot Studio → GitHub. Otherwise, skip it — GitHub Copilot (Path E) is the Microsoft-world answer for autonomous coding, not M365 Copilot.

---

### 3.7 Path F — OpenAI Codex CLI + ChatGPT Plus

**Cost model:** ChatGPT Plus subscription ($20/mo) bundles Codex CLI with cloud sandboxes included.

**How it runs the autonomous implementation phase:**
- Codex CLI runs agentic coding in the terminal.
- ChatGPT Plus ($20/mo) includes cloud sandbox time — no separate cloud-agent billing shock.
- Agent orchestration via Codex sub-agents.

**Strengths:**
- Among the cheapest fully-bundled options for autonomous coding at $20/mo flat.
- Cloud sandbox included in subscription (distinct from Cursor's billed-separately model).
- Works with OpenAI's 4.x and o-series models.

**Weaknesses:**
- Sub-agent coordination not as developed as Claude Code's Agent Teams.
- GPT-series models score lower than Claude Opus/Sonnet on agentic SWE benchmarks as of April 2026.
- MCP ecosystem alignment weaker than Claude Code or Cursor.
- Persona/hook/rules ecosystem less mature (no direct equivalent to `.claude/agents/` frontmatter enforcement).

**Verdict:** Interesting budget option at $20/mo. Fine for solo developers who don't need the full orchestration. Not the recommended choice for this design, but flagged as a viable cheap alternative.

---

### 3.8 Path G — Aider (OSS, BYO API)

**Cost model:** Aider is free OSS. BYO API key. Pay per-token.

**How it runs the autonomous implementation phase:**
- Aider is terminal-first, git-aware (auto-commits every change), extremely disciplined around the edit loop.
- Agentic Index (from Aider's polyglot benchmark) is the benchmark that most closely matches real-world Claude Code behaviour.
- Very efficient token usage — Aider scored 52.7% combined on agentic CLI evals using only ~126K tokens, vs Claude Code's 3x+ token consumption for 2.8pp higher score.
- Native max-iterations, auto-commit-per-edit, no separate review step.

**Strengths:**
- Lowest token-per-task of any option. If you're on API billing, this matters.
- Excellent git integration — every change is a commit, no "accidentally touched 40 files".
- Works with every major model including Claude, GPT, Gemini, local Ollama.

**Weaknesses:**
- No subagent orchestration. Single agent at a time.
- No MCP server support yet (Aider has its own tool protocol).
- No hooks in the Claude Code / Cursor sense.
- Planner → Test Architect → Implementer flow requires external scripting.

**Verdict:** Exceptional choice for **single-agent autonomous implementation with tight cost control**. Not the right fit for the full 8-persona design because of the orchestration gap. Could be substituted for the **Implementer persona specifically** while using Claude Code or Cursor for the others — a hybrid worth considering for token-sensitive operators.

---

### 3.9 Path H — OpenCode / Oh-My-OpenAgent

**Cost model:** Open-source terminal agent, BYO API key to any of 75+ LLM providers. Hashline for bulk operations, 10 purpose-built agents (code gen, review, test, docs, debug, refactor, architecture, security, perf, deploy).

**How it runs the autonomous implementation phase:**
- Native multi-agent. The 10 agents map roughly to our 8 personas (some consolidation, some splits).
- BYO any model — including GLM-5 which matches Sonnet 4.6 on agentic performance at ~1/4 the cost, or GLM-5.1 which matches Opus 4.6 at ~1/12 the cost per input token.
- Terminal-first; no GUI.

**Real-world cost estimates:**
- Using GLM-5 as the default Implementer model + Opus for Planner: **$30–80/month** for heavy autonomous use. This is the cheapest serious-capability option.
- All-Opus via OpenCode: comparable to Cline all-Opus ($300–800/mo).

**Verdict:** Promising **for cost-first teams willing to tune model routing**. Less battle-tested than Claude Code or Cursor. The GLM-5 model-routing trick is the main reason to pick this over Cline.

---

## 4. Side-by-side comparison

### 4.1 Monthly cost for our three usage tiers

Stories assumed: one developer, running the full Planner → Test Architect → Implementer → Reviewer loop per story.

| Option | Light (10 stories/mo) | Medium (40 stories/mo) | Heavy (parallel, 100+ stories/mo) |
|---|---|---|---|
| **Cursor + Claude Code** (Path A) | $120 | $200–300 | $400–$2,000+ |
| **Pure Cursor, local-only** (Path B-local) | $20 | $60–100 | $150–300 |
| **Pure Cursor, cloud agents ON** (Path B-cloud) | $90–160 | $210–700 | $500–$2,000+ |
| **Claude Code only** (Path C) | $20 (Pro) | $100 (Max 5x) | $200 (Max 20x) |
| **Cline + API key** (Path D) | $20–50 | $100–200 | $300–800 |
| **Cline + local Ollama** (Path D) | $0 | $0 | $0 (slow/quality loss) |
| **GitHub Copilot** (Path E) | $10 | $39 + ~$10 Actions | $80–180 |
| **Microsoft 365 Copilot** (Path E2) | N/A — not a coding agent | N/A | N/A |
| **Codex + ChatGPT Plus** (Path F) | $20 | $20 | $20 (capability ceiling reached) |
| **Aider** (Path G) | $10–30 | $60–150 | $200–500 (as Implementer only) |
| **OpenCode + GLM-5** (Path H) | $10–30 | $30–80 | $80–200 |

Bold callouts:
- **GitHub Copilot Pro at $10–39/mo is the cheapest realistic path to autonomous PR creation.** Significantly cheaper than any other option at every tier, with a natural GitHub-native workflow.
- **Claude Code Max 20x at $200/mo is the most predictable ceiling for the heavy tier.** Flat subscription — no token-billed variance, no cloud-agent overage risk.
- **Pure Cursor, local-only (B-local) is cost-competitive with Claude Code Pro and GitHub Copilot.** $20–60/mo for the same autonomy, sacrificing cloud parallelism. The earlier claim that Pure Cursor was inherently expensive was too pessimistic — it applies to the cloud-enabled variant (B-cloud), not to B-local.
- **Cline + local Ollama remains the only truly $0 option** and the only one viable for air-gapped work.
- **Microsoft 365 Copilot is not a coding agent** and shouldn't be evaluated in this table. It's an office-productivity layer that can integrate *with* GitHub Copilot Coding Agent via Copilot Studio.

### 4.2 Capability to run the autonomous implementation phase

| Option | Orchestration | Hooks | MCP | Headless | Parallel | Budget caps | UI |
|---|---|---|---|---|---|---|---|
| Path A Hybrid | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ |
| Path B-local Pure Cursor | ★★★★ | ★★★ | ★★★★★ | ★★★ | ★★★ | ★★★★★ | ★★★★★ |
| Path B-cloud Pure Cursor | ★★★★ | ★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★★★ |
| Path C Claude Code only | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★ |
| Path D Cline | ★★★ | ★★ | ★★★★★ | ★★★ | ★★★ | ★★★★★ | ★★★★ |
| Path E GitHub Copilot | ★★★★ | ★★★ (via Actions) | ★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ |
| Path E2 M365 Copilot | ★ (not coding) | N/A | ★★★ | N/A | N/A | ★★★★ | ★★★ |
| Path F Codex | ★★★ | ★★ | ★★ | ★★★ | ★★★ | ★★★★★ | ★★ |
| Path G Aider | ★★ | ★★ | ★ | ★★★★ | ★ | ★★★★★ | ★★ |
| Path H OpenCode | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★★★★ | ★★ |

### 4.3 Cost-predictability

| Option | How does cost scale? |
|---|---|
| Claude Code subscription (Path C) | **Flat** to the cap; caps hit hard when hit |
| Pure Cursor local-only (Path B-local) | **Flat** ($20 Pro) plus minor overage |
| Pure Cursor cloud-on (Path B-cloud) | **Unbounded** unless hard spend cap set |
| Cursor + Claude Code (Path A) | **Mostly flat** plus cloud-agent variance |
| Cline API (Path D) | **Linear** with usage; no cap unless you script one |
| Cline Ollama (Path D) | **$0** regardless of usage |
| GitHub Copilot (Path E) | **Flat** allowance + $0.04/request overage + Actions minutes |
| M365 Copilot (Path E2) | **Flat** + Azure consumption for Studio agents |
| Codex + ChatGPT Plus (Path F) | **Flat** |
| Aider API (Path G) | **Linear** with usage |
| OpenCode API (Path H) | **Linear** with usage |

---

## 5. Recommendation matrix

### 5.1 If you want the cheapest predictable autonomous-capable setup

→ **GitHub Copilot Pro or Pro+** (Path E) at $10–39/mo. Coding Agent handles the autonomous PR creation, Code Review handles the Reviewer persona, guardrails move into GitHub Actions. Works in any IDE you already use.

Or **Claude Code Max 5x or Max 20x** (Path C) at $100–200/mo. Best-of-class orchestration and hooks, native Agent Teams, predictable flat-rate, more mature orchestration than Copilot.

### 5.2 If you want the absolute cheapest possible setup

→ **Cline + local Ollama with Qwen 2.5 Coder 32B or DeepSeek V3** (Path D). **$0/mo** if you ignore electricity. Quality gap vs frontier models is real but narrowing. Acceptable for small stories, pattern-heavy refactors, and boilerplate. Escalate to API for harder stories.

### 5.3 If you want the best capability and are willing to pay for it

→ **Path A Hybrid (Cursor + Claude Code)**, disciplined with hard spend caps. $200–400/mo steady state for a serious operator. Only pick this if you trust yourself to never leave cloud agents running unattended.

### 5.4 If you want single-vendor simplicity + visual IDE

→ **Path B-local Pure Cursor** with cloud agents **turned off** (Cursor Pro or Pro+). $20–100/mo. Sacrifices cloud parallelism for cost certainty. **This is the cost-sensitive Cursor answer** — the cloud-enabled variant is the expensive one.

### 5.5 If you want full-team parallel cloud execution

→ **Path B-cloud Pure Cursor** with cloud agents **on** (Pro+ or Ultra). $200–700/mo for disciplined teams, higher if uncapped. Best throughput when Linear velocity is real. Requires per-Automation budget caps and admin discipline.

### 5.6 If you want to minimise token cost via model routing

→ **OpenCode with GLM-5/GLM-5.1 routing** (Path H). $30–100/mo for heavy use. Requires model-routing discipline. Less battle-tested.

### 5.7 If you need air-gapped or privacy-sensitive operation

→ **Cline + Ollama** (Path D). Only option where code never leaves the machine.

### 5.8 If your organisation has M365 Copilot

→ **Combine M365 Copilot Studio + GitHub Copilot Coding Agent**. Use Copilot Studio to catch business-process triggers (SharePoint updates, Teams messages, mailbox events); route them into GitHub Issues; let GitHub Copilot handle the actual coding autonomously. Marginal cost = $0 on top of your existing M365 licensing, since coding happens in GitHub Copilot anyway.

---

## 6. Cross-cutting cost controls (apply to every option)

Regardless of which path you pick, the following controls drop costs 40–70% without quality loss:

1. **Model routing.** Haiku for trivia, Sonnet for 80% of implementation, Opus only for Planner and Reviewer. A 50x cost difference exists between cheapest and most expensive models. Set this per-persona in the persona frontmatter `model:` field, or configure in Cline's settings.

2. **Max-iterations cap.** 15–25 is the right ceiling. The `verify-completion-promise.sh` hook already enforces 30. If the agent can't solve a problem in 25 tries, it won't solve it in 100. Drop out and ask for human help.

3. **Serena for codebase context.** Agents reading full files instead of using LSP-backed symbol navigation burn 5–10x tokens. This was already recommended in `MEMORY-AND-CONTEXT.md`. The cost argument reinforces it.

4. **Context compaction.** Claude Code does this automatically at 50% context. For Cline / Aider / OpenCode, run `/compact` periodically or configure auto-compaction. On subscription plans this doesn't save cost, but on API-billed setups it cuts spend by the fraction that would've been cache-read tokens.

5. **Hard per-story budget cap.** `--max-budget-usd 10` in Claude Code. Per-run spend limit in Cursor. Premium-request allowance in Copilot. Custom wrapper in Cline. Any story that hits the cap without emitting STORY_COMPLETE is labelled BLOCKED for human review.

6. **Subscription stacking audit.** Every 30 days, check which AI subscriptions you've opened fewer than 5 times. Cancel them. Claude Code + Cursor + Copilot = $50/mo paying for three tools when one covers 90% of use cases.

7. **Kill unsupervised cloud agents.** If no human will review the output within 2 hours, don't start the run. Every documented $2,000/weekend bill story involves cloud agents running unattended for days.

---

## 7. One-page decision flow

```
Do you need the tool to never send code off your machine?
├── Yes → Cline + local Ollama. $0/mo. Accept capability loss.
└── No
    │
    Is GitHub your primary code host and do you prefer issue-to-PR workflows?
    ├── Yes, cost-sensitive → GitHub Copilot Pro $10/mo. Move guardrails into GitHub Actions.
    ├── Yes, power-user with frontier models → GitHub Copilot Pro+ $39/mo.
    └── No or want more orchestration control
        │
        Is $200/mo predictable spend OK?
        ├── Yes → Claude Code Max 20x. Best cost/capability. Pair with VS Code + Onlook.
        └── No
            │
            Do you want a visual IDE more than cloud parallelism?
            ├── Yes, solo dev → Pure Cursor local-only (B-local), Pro or Pro+. $20-100/mo predictable.
            ├── Yes, team with high velocity → Pure Cursor with cloud agents (B-cloud), disciplined caps. $200-700/mo.
            └── No, terminal is fine
                │
                Are you willing to do model routing (Opus/Sonnet/Haiku per persona)?
                ├── Yes, Anthropic-first → Cline + BYO API, ~$20-100/mo moderate use.
                ├── Yes, willing to use GLM/MiniMax → OpenCode with GLM-5 routing, ~$30-100/mo heavy use.
                └── No → Claude Code Pro $20 for light use.
```

---

## 8. Bottom line

- **For most cost-sensitive operators: GitHub Copilot Pro or Pro+** (Path E) is the cheapest realistic path to autonomous PR creation. $10–39/mo flat. Works with every IDE. Moves guardrails into GitHub Actions, which is arguably better engineering discipline anyway.
- **For maximum orchestration capability per dollar: Claude Code only** (Path C) at Max 5x or Max 20x. $100–200/mo flat, predictable, best-of-class Agent Teams and hooks.
- **For solo devs who want a visual IDE on a budget: Pure Cursor local-only** (Path B-local). $20–100/mo. Don't enable cloud agents unless you've modelled the cost.
- **For teams with real Linear velocity and spend discipline: Pure Cursor cloud-on** (Path B-cloud). Best throughput. Requires per-Automation caps.
- **For open-source / air-gapped / local-model: Cline + Ollama** (Path D). $0/mo.
- **For Microsoft-shop business-process integration: M365 Copilot Studio → GitHub Copilot** (E2 → E). $0 marginal cost.
- **Whichever path you pick, the design in `autonomous-swe-design.md` is unchanged.** Personas, rules, hooks, Serena, MemPalace, the story loop, the six-tier test pyramid — all tool-agnostic. The tool is how the loop runs; the design is what runs.

*End of cost analysis.*
