"use strict";
/**
 * Runs a bash hook script with hook JSON on stdin and forwards stdout/stderr.
 * Use this from hooks.json instead of calling bash/ps1 directly to avoid Windows
 * console flash (windowsHide) and to resolve Git Bash when "bash" is not on PATH.
 *
 * Usage: node .cursor/hooks/run-hook.cjs <path-to-script.sh>
 * TypeScript twin: .cursor/hooks/wrappers.ts (Node 22+: --experimental-strip-types)
 * Working directory should be the workspace root (Cursor default for project hooks).
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const scriptArg = process.argv[2];
if (!scriptArg) {
  process.stderr.write("run-hook.cjs: missing path to .sh script\n");
  process.exit(2);
}

const scriptPath = path.isAbsolute(scriptArg)
  ? scriptArg
  : path.resolve(process.cwd(), scriptArg);

if (!fs.existsSync(scriptPath)) {
  process.stderr.write(`run-hook.cjs: script not found: ${scriptPath}\n`);
  process.exit(2);
}

let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {
  input = "";
}

function safeAppendAudit(line) {
  try {
    const outDir = path.resolve(process.cwd(), "reports");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "agent-audit.jsonl");
    fs.appendFileSync(outPath, line + "\n", "utf8");
  } catch {
    // Never break hooks because audit logging failed.
  }
}

function inferPhaseFromInput(raw) {
  try {
    const obj = JSON.parse(String(raw || ""));
    // Cursor hook payloads vary; try multiple common keys.
    return (
      obj?.hook_event ||
      obj?.hookEvent ||
      obj?.event ||
      obj?.hook?.event ||
      obj?.hook?.name ||
      ""
    );
  } catch {
    return "";
  }
}

const branchName = (() => {
  try {
    const res = spawnSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      windowsHide: true,
      env: process.env,
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });
    return String(res.stdout || "").trim();
  } catch {
    return "";
  }
})();

const storyMatch = branchName.match(/([A-Z]+-\d+)/);
const storyId = storyMatch ? storyMatch[1] : "";

const isWin = process.platform === "win32";

function findBash() {
  if (process.env.BASH_EXE && fs.existsSync(process.env.BASH_EXE)) {
    return process.env.BASH_EXE;
  }
  if (!isWin) {
    return "bash";
  }
  const pf = process.env.ProgramFiles || "";
  const pf86 = process.env["ProgramFiles(x86)"] || "";
  const candidates = [
    path.join(pf, "Git", "bin", "bash.exe"),
    path.join(pf86, "Git", "bin", "bash.exe"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return "bash";
}

const bash = findBash();
const res = spawnSync(bash, [scriptPath], {
  input,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  windowsHide: true,
  env: process.env,
  cwd: process.cwd(),
});

if (res.stdout) {
  process.stdout.write(res.stdout);
}
if (res.stderr) {
  process.stderr.write(res.stderr);
}

safeAppendAudit(
  JSON.stringify({
    schema: "gdrive.agentAudit.v1",
    timestamp: new Date().toISOString(),
    kind: "hook",
    hook: {
      script: path.relative(process.cwd(), scriptPath).replace(/\\/g, "/"),
      runner: ".cursor/hooks/run-hook.cjs",
      phase: inferPhaseFromInput(input),
      exitCode: res.status === null ? 1 : res.status,
    },
    context: {
      cwd: process.cwd().replace(/\\/g, "/"),
      storyId,
      branch: branchName,
    },
  }),
);

const code = res.status === null ? 1 : res.status;
process.exit(code);
