"use strict";
/**
 * Agent audit: compact (one line per agent stop) vs verbose (per hook).
 * Config: reports/agent-audit.config.json (optional) or env AGENT_AUDIT_MODE=compact|verbose
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPORTS = path.join(process.cwd(), "reports");
const CONFIG_PATH = path.join(REPORTS, "agent-audit.config.json");
const BUFFER_PATH = path.join(REPORTS, ".agent-audit-session-buffer.json");
const COMPACT_LOG = path.join(REPORTS, "agent-audit.jsonl");
const VERBOSE_LOG = path.join(REPORTS, "agent-audit-verbose.jsonl");

function ensureReports() {
  try {
    fs.mkdirSync(REPORTS, { recursive: true });
  } catch {
    /* ignore */
  }
}

function loadConfig() {
  const defaults = {
    mode: "compact",
    /** When true, verbose lines go to agent-audit-verbose.jsonl even in compact mode */
    dualWriteVerbose: false,
    /** In verbose mode, still emit one compact summary on stop */
    compactSummaryOnStopInVerbose: true,
    maxStdinChars: 2000,
    maxStdoutChars: 4000,
  };
  if (process.env.AGENT_AUDIT_MODE === "verbose") defaults.mode = "verbose";
  if (process.env.AGENT_AUDIT_MODE === "compact") defaults.mode = "compact";
  if (process.env.AGENT_AUDIT_DUAL === "1") defaults.dualWriteVerbose = true;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const j = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return { ...defaults, ...j };
    }
  } catch {
    /* ignore bad config */
  }
  return defaults;
}

function redactSnippet(s, maxLen) {
  let t = String(s || "");
  t = t.replace(/\bgithub_pat_[A-Za-z0-9]+\b/gi, "[redacted-token]");
  t = t.replace(/\bsk_live_[a-zA-Z0-9]+\b/g, "[redacted]");
  t = t.replace(/\bapi[_-]?key["']?\s*[:=]\s*["'][^"']+["']/gi, 'api_key":"[redacted]"');
  if (t.length > maxLen) t = t.slice(0, maxLen) + "…";
  return t;
}

function parseStdinPayload(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function inferToolFromPayload(obj) {
  if (!obj || typeof obj !== "object") return "";
  return (
    obj.tool_name ||
    obj.tool ||
    obj.name ||
    obj.tool_input?.tool_name ||
    obj.hook_payload?.tool_name ||
    ""
  );
}

function tryParseAgentMessage(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/);
  const lastLine = lines[lines.length - 1]?.trim();
  if (!lastLine || !lastLine.startsWith("{")) return { had: false, text: "", raw: "" };
  try {
    const o = JSON.parse(lastLine);
    if (typeof o.agent_message === "string" && o.agent_message.length > 0) {
      const text = redactSnippet(o.agent_message, 600);
      return { had: true, text, raw: redactSnippet(lastLine, 800) };
    }
  } catch {
    /* ignore */
  }
  return { had: false, text: "", raw: "" };
}

function classifyScript(scriptRel) {
  const base = path.basename(scriptRel.replace(/\\/g, "/") || "");
  if (base === "memory-phase-router.sh")
    return { bucket: "memory_router", id: "memory-phase-router" };
  if (base === "graphify-preflight-search.sh")
    return { bucket: "graphify", id: "graphify-preflight" };
  if (base === "memori-session.sh") return { bucket: "memori", id: "memori-session" };
  if (base === "block-dangerous.sh")
    return { bucket: "safety", id: "block-dangerous" };
  if (base === "enforce-plan-mode.sh")
    return { bucket: "governance", id: "enforce-plan-mode" };
  if (base === "enforce-tokens.sh")
    return { bucket: "style", id: "enforce-tokens" };
  if (base === "vibecop-lint.sh") return { bucket: "lint", id: "vibecop-lint" };
  if (base === "verify-completion-promise.sh")
    return { bucket: "governance", id: "verify-completion-promise" };
  if (base === "linear-sync-prompt.sh")
    return { bucket: "governance", id: "linear-sync-prompt" };
  return { bucket: "other", id: base.replace(/\.sh$/i, "") || "shell-hook" };
}

function readBuffer() {
  ensureReports();
  try {
    const raw = fs.readFileSync(BUFFER_PATH, "utf8").trim();
    if (!raw) return { sessionId: null, events: [], startedAt: null };
    return JSON.parse(raw);
  } catch {
    return { sessionId: null, events: [], startedAt: null };
  }
}

function writeBuffer(buf) {
  ensureReports();
  fs.writeFileSync(BUFFER_PATH, JSON.stringify(buf, null, 0), "utf8");
}

function appendEvent(ev) {
  const cfg = loadConfig();
  ensureReports();
  let buf = readBuffer();
  if (!buf.sessionId) {
    buf.sessionId = crypto.randomBytes(8).toString("hex");
    buf.startedAt = new Date().toISOString();
    buf.events = [];
  }
  buf.events.push(ev);

  const mode = cfg.mode === "verbose" ? "verbose" : "compact";
  const writeVerbose =
    mode === "verbose" || cfg.dualWriteVerbose === true;

  if (writeVerbose) {
    const verboseLine = {
      schema: "autoswekit.agentAudit.v7.verbose",
      timestamp: ev.t,
      sessionId: buf.sessionId,
      hook: ev,
    };
    fs.appendFileSync(VERBOSE_LOG, JSON.stringify(verboseLine) + "\n", "utf8");
  }

  writeBuffer(buf);
}

/**
 * Shell hook audit (via run-hook.cjs).
 */
function recordShellHook(opts) {
  const cfg = loadConfig();
  const {
    scriptPath,
    exitCode,
    durationMs,
    stdinRaw,
    stdout,
    stderr,
  } = opts;
  const rel = path.isAbsolute(scriptPath)
    ? path.relative(process.cwd(), scriptPath).replace(/\\/g, "/")
    : scriptPath.replace(/\\/g, "/");
  const { bucket, id } = classifyScript(rel);
  const payload = parseStdinPayload(stdinRaw);
  const tool = inferToolFromPayload(payload);
  const phase =
    payload?.hook_event ||
    payload?.hookEvent ||
    payload?.event ||
    payload?.hook?.event ||
    payload?.hook?.name ||
    "";
  const agent = tryParseAgentMessage(stdout);

  const ev = {
    t: new Date().toISOString(),
    family: "run-hook",
    id,
    bucket,
    script: rel,
    exitCode,
    durationMs,
    tool: String(tool || ""),
    hookPhaseHint: phase,
    hadStderr: Boolean(stderr && String(stderr).trim()),
    stdinSnippet: redactSnippet(stdinRaw, cfg.maxStdinChars),
    stdoutSnippet: redactSnippet(
      stdout,
      cfg.maxStdoutChars,
    ),
    stderrSnippet: redactSnippet(stderr, cfg.maxStdoutChars),
    agentMessageEmitted: agent.had,
    agentMessagePreview: agent.text,
  };

  appendEvent(ev);
}

/**
 * context-mode MCP hook subprocess (wrapper).
 */
function recordContextModeHook(opts) {
  const cfg = loadConfig();
  const { phase, exitCode, durationMs, stdinRaw, stdout, stderr } = opts;
  const ev = {
    t: new Date().toISOString(),
    family: "context-mode",
    id: `context-mode-${phase}`,
    bucket: "context_mode",
    script: `context-mode hook cursor ${phase}`,
    phase,
    exitCode,
    durationMs,
    tool: "",
    hookPhaseHint: "",
    hadStderr: Boolean(stderr && String(stderr).trim()),
    stdinSnippet: redactSnippet(stdinRaw, cfg.maxStdinChars),
    stdoutSnippet: redactSnippet(stdout, cfg.maxStdoutChars),
    stderrSnippet: redactSnippet(stderr, cfg.maxStdoutChars),
    agentMessageEmitted: false,
    agentMessagePreview: "",
  };
  appendEvent(ev);
}

function summarizeBuffer(buf) {
  const hooks = {};
  const byBucket = {};
  const contextModePhases = {};
  let agentMessagesEmitted = 0;
  let totalDurationMs = 0;
  /** @type {string[]} */
  const toolsDistinct = [];

  for (const e of buf.events || []) {
    totalDurationMs += typeof e.durationMs === "number" ? e.durationMs : 0;
    const key = e.id || e.script || "unknown";
    hooks[key] = (hooks[key] || 0) + 1;
    const b = e.bucket || "other";
    byBucket[b] = byBucket[b] || { count: 0, agent_messages: 0 };
    byBucket[b].count++;
    if (e.agentMessageEmitted) {
      agentMessagesEmitted++;
      byBucket[b].agent_messages++;
    }
    if (e.family === "context-mode" && e.phase) {
      contextModePhases[e.phase] = (contextModePhases[e.phase] || 0) + 1;
    }
    if (e.tool && !toolsDistinct.includes(e.tool))
      toolsDistinct.push(e.tool);
  }

  return {
    hooks,
    by_bucket: byBucket,
    context_mode_phases: contextModePhases,
    agent_messages_emitted: agentMessagesEmitted,
    tools_touched_hint: toolsDistinct.filter(Boolean),
    event_count: (buf.events || []).length,
    total_hook_duration_ms: totalDurationMs,
  };
}

function flushCompactSummary() {
  const cfg = loadConfig();
  ensureReports();
  const buf = readBuffer();
  if (!buf.events || buf.events.length === 0) {
    writeBuffer({ sessionId: null, events: [], startedAt: null });
    return { wrote: false, reason: "empty_buffer" };
  }

  const branchName = (() => {
    try {
      const { spawnSync } = require("child_process");
      const res = spawnSync("git", ["branch", "--show-current"], {
        encoding: "utf8",
        windowsHide: true,
        cwd: process.cwd(),
      });
      return String(res.stdout || "").trim();
    } catch {
      return "";
    }
  })();
  const storyMatch = branchName.match(/([A-Z]+-\d+)/);
  const storyId = storyMatch ? storyMatch[1] : "";

  const compact = {
    schema: "autoswekit.agentAudit.v7.compact",
    timestamp: new Date().toISOString(),
    kind: "session_stop",
    mode: cfg.mode,
    sessionId: buf.sessionId,
    span: {
      startedAt: buf.startedAt,
      endedAt: new Date().toISOString(),
    },
    context: {
      cwd: process.cwd().replace(/\\/g, "/"),
      branch: branchName,
      storyId,
    },
    memory_and_context_management: summarizeBuffer(buf),
  };

  if (!(cfg.mode === "verbose" && cfg.compactSummaryOnStopInVerbose === false)) {
    fs.appendFileSync(COMPACT_LOG, JSON.stringify(compact) + "\n", "utf8");
  }

  writeBuffer({ sessionId: null, events: [], startedAt: null });
  return { wrote: true, eventCount: compact.memory_and_context_management.event_count };
}

module.exports = {
  loadConfig,
  recordShellHook,
  recordContextModeHook,
  flushCompactSummary,
  paths: { COMPACT_LOG, VERBOSE_LOG, BUFFER_PATH, CONFIG_PATH },
};
