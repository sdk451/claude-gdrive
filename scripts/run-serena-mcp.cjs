#!/usr/bin/env node
/**
 * Serena MCP bridge: one streamable-http server per project **and MCP context**, reused by reconnects.
 *
 * Env:
 *   AUTONOMOUS_SWE_PROJECT_ROOT / SERENA_PROJECT_ROOT — explicit project root
 *   SERENA_MCP_CONTEXT — claude-code | codex | ide (see resolveSerenaContext())
 *   SERENA_MCP_PORT    — override stable port (disables per-context port split)
 *   SERENA_MCP_HOST    — default 127.0.0.1
 *   SERENA_LOCK_MAX_AGE_MS — stale lock threshold (default 120000)
 *
 * Port selection: hash(projectRoot + context) so Cursor (ide) and Claude Code do not
 * share one server — otherwise whichever agent starts first wins the dashboard context.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

// solidlsp declares no terraform-ls runtime dependency for win-arm64, so on a
// Windows ARM host the terraform language server throws before any install check.
// That exception is aggregated by the LS manager and can abort language server
// init entirely, taking working TypeScript and Python servers with it - which
// surfaces to the agent as "No active project". Re-applied on every boot because
// it patches a uv tool install that is wiped whenever that install is rebuilt.
try {
  const { apply } = require('./serena/patch-terraform-arm64.cjs');
  const r = apply({ quiet: true });
  if (r && r.changed) process.stderr.write('[serena] declared win-arm64 terraform-ls (amd64 under emulation)\n');
  else if (r && !r.ok) process.stderr.write('[serena] terraform arm64 patch skipped: ' + r.reason + '\n');
} catch (err) {
  process.stderr.write('[serena] terraform arm64 patch unavailable: ' + (err && err.message) + '\n');
}

// Ensure a git worktree is registered with serena BEFORE resolving the root.
// nearestProjectRoot() walks up looking for .serena/project.yml, but .serena/ is
// gitignored so a worktree never has one. It therefore either finds nothing (and
// serena starts with no active project - "No active project", measured as 0 serena
// tool calls across 43 sessions) or walks up into the CANONICAL repo and silently
// indexes a different branch, which is worse. Registering first makes the walk
// terminate inside the worktree where it belongs.
try {
  const { register } = require('./serena/serena-project.cjs');
  const r = register(process.cwd());
  if (r && r.ok && r.changed) {
    process.stderr.write('[serena] registered worktree ' + r.root + (r.name ? ' as ' + r.name : '') + '\n');
  }
} catch (err) {
  process.stderr.write('[serena] worktree registration skipped: ' + (err && err.message) + '\n');
}

const projectRoot = resolveProjectRoot();

// Record the bridge pid inside the project so `worktree remove` can stop it. A
// live bridge holds an open handle on the directory and git worktree remove
// fails with EPERM until it is released.
try {
  const pidDir = path.join(projectRoot, '.serena');
  fs.mkdirSync(pidDir, { recursive: true });
  fs.writeFileSync(path.join(pidDir, 'bridge.pid'), String(process.pid));
  const clearPid = () => { try { fs.rmSync(path.join(pidDir, 'bridge.pid'), { force: true }); } catch {} };
  process.on('exit', clearPid);
  process.on('SIGTERM', () => { clearPid(); process.exit(0); });
} catch { /* best effort */ }
try {
  process.chdir(projectRoot);
} catch {
  /* Serena spawn still receives cwd explicitly below. */
}
const serenaContext = resolveSerenaContext();
const explicitPort = Number.parseInt(process.env.SERENA_MCP_PORT || '', 10);
const port = Number.isInteger(explicitPort)
  ? explicitPort
  : stablePort(`${projectRoot}|${serenaContext}`);
const host = process.env.SERENA_MCP_HOST || '127.0.0.1';
// Streamable HTTP exposes a single endpoint handling both POST and GET. The old
// HTTP+SSE transport it replaces used /sse plus a separate POST endpoint, and
// is deprecated: clients probe POST first and only fall back to GET /sse on a
// 4xx, which is why serena logs showed a 405 on every connection.
const mcpUrl = `http://${host}:${port}/mcp`;
const serenaDir = path.join(projectRoot, '.serena');
const metaPath = path.join(serenaDir, `mcp-server-${serenaContext}.json`);
const lockPath = path.join(serenaDir, `mcp-start-${serenaContext}.lock`);
const bridgesPath = path.join(serenaDir, `mcp-bridges-${serenaContext}.json`);
const lockMaxAgeMs = Number.parseInt(process.env.SERENA_LOCK_MAX_AGE_MS || '120000', 10);
const shutdownOnIdle = process.env.SERENA_MCP_SHUTDOWN_ON_IDLE !== '0';

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function readConfigProjectRoot(root) {
  const configPath = path.join(root, 'docs', 'config.yaml');
  if (!fs.existsSync(configPath)) return null;
  const text = fs.readFileSync(configPath, 'utf8');
  const raw = stripQuotes(text.match(/^project_root:\s*(.+)$/m)?.[1] || '');
  if (!raw) return root;
  return path.resolve(root, raw);
}

function nearestProjectRoot(start) {
  let dir = path.resolve(start);
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  } catch {
    /* keep original */
  }

  while (true) {
    const configuredRoot = readConfigProjectRoot(dir);
    if (configuredRoot) return configuredRoot;
    if (fs.existsSync(path.join(dir, '.serena', 'project.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveProjectRoot() {
  const rootArgIndex = process.argv.findIndex((arg) => arg === '--project-root');
  const argRoot = rootArgIndex >= 0 ? process.argv[rootArgIndex + 1] : null;
  const candidates = [
    argRoot,
    process.env.AUTONOMOUS_SWE_PROJECT_ROOT,
    process.env.SERENA_PROJECT_ROOT,
    process.cwd(),
    path.resolve(__dirname, '..'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const root = nearestProjectRoot(candidate);
    if (root) return path.resolve(root);
  }

  return path.resolve(process.cwd());
}

/** @returns {'claude-code'|'codex'|'ide'} */
function resolveSerenaContext() {
  const fromEnv = process.env.SERENA_MCP_CONTEXT?.trim();
  if (fromEnv) return fromEnv;

  const configPath = path.join(projectRoot, 'docs', 'config.yaml');
  if (fs.existsSync(configPath)) {
    const text = fs.readFileSync(configPath, 'utf8');
    const primary = text.match(/^primary_agent:\s*(\S+)/m)?.[1];
    /** @type {Record<string, string>} */
    const byPrimary = {
      cursor: 'ide',
      opencode: 'ide',
      'claude-code': 'claude-code',
      codex: 'codex',
    };
    if (primary && byPrimary[primary]) return byPrimary[primary];
  }
  return 'ide';
}

function stablePort(input) {
  let hash = 0;
  for (const ch of input) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 17200 + (hash % 8000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isListening() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Streamable HTTP has no long-lived GET stream to sniff: a bare GET /mcp
    // without a session is legitimately answered with 4xx. Readiness is therefore
    // "the endpoint is answering HTTP at all", not "it returned 200 with an SSE
    // content-type". Any status back from /mcp means uvicorn is serving.
    const req = http.request({ host, port, path: '/mcp', method: 'GET', timeout: 750 }, (res) => {
      res.destroy();
      req.destroy();
      finish(typeof res.statusCode === 'number');
    });
    req.end();
    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.on('error', () => finish(false));
  });
}

function readLockPid() {
  try {
    const pid = Number.parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function stopProcess(pid, reason) {
  if (!pid || !isProcessAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
    writeMeta({ stopped: reason, stoppedPid: pid });
  } catch {
    /* ignore */
  }
}

function removeStaleLock(reason) {
  try {
    if (!fs.existsSync(lockPath)) return false;
    const stat = fs.statSync(lockPath);
    const pid = readLockPid();
    const ageMs = Date.now() - stat.mtimeMs;
    if (!isProcessAlive(pid) || ageMs > lockMaxAgeMs) {
      fs.unlinkSync(lockPath);
      writeMeta({ lockCleared: reason, previousPid: pid ?? null });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function readBridgePids() {
  try {
    const data = JSON.parse(fs.readFileSync(bridgesPath, 'utf8'));
    const pids = Array.isArray(data?.bridges) ? data.bridges : [];
    return pids.filter((pid) => isProcessAlive(pid));
  } catch {
    return [];
  }
}

function writeBridgePids(pids) {
  try {
    fs.mkdirSync(serenaDir, { recursive: true });
    fs.writeFileSync(
      bridgesPath,
      JSON.stringify(
        {
          bridges: [...new Set(pids.filter((pid) => Number.isInteger(pid)))],
          updatedAt: new Date().toISOString(),
          context: serenaContext,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } catch {
    /* best-effort */
  }
}

function registerBridgePid(pid) {
  if (!Number.isInteger(pid)) return;
  const alive = readBridgePids().filter((p) => p !== pid);
  alive.push(pid);
  writeBridgePids(alive);
}

function unregisterBridgePid(pid) {
  if (!Number.isInteger(pid)) return;
  const remaining = readBridgePids().filter((p) => p !== pid);
  writeBridgePids(remaining);
  return remaining;
}

async function maybeStopIdleServer(reason) {
  if (!shutdownOnIdle) return;
  const remaining = readBridgePids();
  if (remaining.length > 0) return;
  if (!(await isListening())) return;
  const meta = readMeta();
  if (meta?.pid) {
    stopProcess(meta.pid, reason);
    await sleep(400);
  }
}

function writeMeta(extra = {}) {
  try {
    fs.mkdirSync(serenaDir, { recursive: true });
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          host,
          port,
          mcpUrl,
          context: serenaContext,
          projectRoot,
          updatedAt: new Date().toISOString(),
          ...extra,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
  } catch {
    /* best-effort */
  }
}

function logPath() {
  try {
    fs.mkdirSync(serenaDir, { recursive: true });
  } catch {}
  return path.join(serenaDir, `mcp-server-${serenaContext}.log`);
}

async function acquireStartLock() {
  fs.mkdirSync(serenaDir, { recursive: true });
  for (let i = 0; i < 60; i += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (await isListening()) return false;
      removeStaleLock('wait-loop');
      await sleep(250);
    }
  }
  removeStaleLock('timeout');
  return false;
}

function releaseStartLock() {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

function startSerenaServer() {
  const out = fs.openSync(logPath(), 'a');
  fs.writeSync(
    out,
    `\n--- start ${new Date().toISOString()} context=${serenaContext} port=${port} projectRoot=${projectRoot} ---\n`,
  );
  const child = spawn(
    'serena',
    [
      'start-mcp-server',
      '--project-from-cwd',
      `--context=${serenaContext}`,
      '--transport',
      'streamable-http',
      '--host',
      host,
      '--port',
      String(port),
      '--open-web-dashboard',
      'false',
    ],
    {
      cwd: projectRoot,
      detached: true,
      stdio: ['ignore', out, out],
      shell: process.platform === 'win32',
    },
  );
  child.unref();
  fs.closeSync(out);
  writeMeta({ pid: child.pid, startedBy: 'run-serena-mcp.cjs' });
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    if (await isListening()) {
      writeMeta({ pid: readMeta()?.pid ?? null, status: 'listening' });
      return;
    }
    await sleep(250);
  }
  removeStaleLock('waitForServer-failed');
  throw new Error(
    `Serena MCP server did not start at ${mcpUrl} (context=${serenaContext}); see ${logPath()}. ` +
      `If stuck, delete ${lockPath} and retry.`,
  );
}

async function ensureSerenaServer() {
  const meta = readMeta();

  if (await isListening()) {
    if (meta?.context === serenaContext && meta?.port === port) {
      writeMeta({ pid: meta.pid ?? null, status: 'reused' });
      return;
    }
    // SERENA_MCP_PORT override or legacy shared server — wrong context on this port
    if (meta?.pid) stopProcess(meta.pid, 'context-mismatch');
    await sleep(500);
  }

  removeStaleLock('pre-start');

  const gotLock = await acquireStartLock();
  if (!gotLock) {
    if (await isListening()) {
      const again = readMeta();
      if (again?.context === serenaContext) return;
    }
    await waitForServer();
    return;
  }

  try {
    if (await isListening()) {
      const again = readMeta();
      if (again?.context === serenaContext) return;
    }
    startSerenaServer();
    await waitForServer();
  } finally {
    releaseStartLock();
  }
}

function runBridge() {
  registerBridgePid(process.pid);
  const child = spawn('npx', ['-y', 'mcp-remote', mcpUrl], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  registerBridgePid(child.pid);

  let shuttingDown = false;
  const cleanup = async (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    unregisterBridgePid(process.pid);
    if (child.pid) unregisterBridgePid(child.pid);
    await maybeStopIdleServer('last-bridge-exit');
    if (signal) {
      try {
        process.kill(process.pid, signal);
      } catch {
        process.exit(code ?? 1);
      }
      return;
    }
    process.exit(code ?? 0);
  };

  child.on('exit', (code, signal) => {
    cleanup(code, signal).catch(() => process.exit(code ?? 1));
  });

  process.on('SIGINT', () => {
    try {
      child.kill('SIGINT');
    } catch {
      cleanup(130, 'SIGINT').catch(() => process.exit(130));
    }
  });
  process.on('SIGTERM', () => {
    try {
      child.kill('SIGTERM');
    } catch {
      cleanup(143, 'SIGTERM').catch(() => process.exit(143));
    }
  });
}

(async () => {
  if (Number.isInteger(explicitPort)) {
    process.stderr.write(
      `[run-serena-mcp] SERENA_MCP_PORT=${port} overrides per-context port; context=${serenaContext}\n`,
    );
  }
  await ensureSerenaServer();
  runBridge();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

module.exports = { resolveSerenaContext, stablePort };
