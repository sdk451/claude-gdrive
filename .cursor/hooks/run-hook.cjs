"use strict";
/**
 * Runs a bash hook script with hook JSON on stdin and forwards stdout/stderr.
 * Audit: see audit-lib.cjs (compact flush on agent stop vs verbose per hook).
 *
 * Usage: node .cursor/hooks/run-hook.cjs <path-to-script.sh>
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const audit = require("./audit-lib.cjs");

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
  const localAppData = process.env.LOCALAPPDATA || "";
  const userProfile = process.env.USERPROFILE || "";
  const candidates = [
    path.join(pf, "Git", "bin", "bash.exe"),
    path.join(pf86, "Git", "bin", "bash.exe"),
    // winget / scoop / manual installs
    path.join(pf, "Git", "usr", "bin", "bash.exe"),
    path.join(pf86, "Git", "usr", "bin", "bash.exe"),
    // Scoop default: C:\Users\<user>\scoop\apps\git\current\bin\bash.exe
    path.join(userProfile, "scoop", "apps", "git", "current", "bin", "bash.exe"),
    // Git portable (common enterprise install)
    "C:\\PortableGit\\bin\\bash.exe",
    // Windows Subsystem for Linux (bash.exe on PATH)
    path.join(localAppData, "Microsoft", "WindowsApps", "bash.exe"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  // Last resort: hope bash is on PATH (e.g. WSL, MSYS2, conda)
  return "bash";
}

const bash = findBash();
function repoLocalGitEnv() {
  const env = { ...process.env };
  const envPath = path.resolve(process.cwd(), ".cursor", "ide-git-env.json");
  let editor = "";
  let gitCommand = "";
  try {
    const cfg = JSON.parse(fs.readFileSync(envPath, "utf8"));
    editor = String(cfg.editorCommand || "").trim();
    gitCommand = String(cfg.gitCommand || "").trim();
  } catch {
    editor = "";
    gitCommand = "";
  }
  if (gitCommand && fs.existsSync(gitCommand)) {
    const gitDir = path.dirname(gitCommand);
    const pathKey = Object.prototype.hasOwnProperty.call(env, "Path") ? "Path" : "PATH";
    env[pathKey] = `${gitDir}${path.delimiter}${env[pathKey] || ""}`;
    env.KIT_GIT = gitCommand;
  }
  if (!editor) {
    try {
      const localEditor = spawnSync("git", ["config", "--local", "--get", "core.editor"], {
        encoding: "utf8",
        windowsHide: true,
        cwd: process.cwd(),
      });
      editor = (localEditor.stdout || "").trim();
    } catch {
      editor = "";
    }
  }
  if (editor) {
    env.GIT_EDITOR = editor;
    env.VISUAL = editor;
    env.EDITOR = editor;
    const count = Number.parseInt(env.GIT_CONFIG_COUNT || "0", 10) || 0;
    env[`GIT_CONFIG_KEY_${count}`] = "core.editor";
    env[`GIT_CONFIG_VALUE_${count}`] = editor;
    env[`GIT_CONFIG_KEY_${count + 1}`] = "sequence.editor";
    env[`GIT_CONFIG_VALUE_${count + 1}`] = editor;
    env.GIT_CONFIG_COUNT = String(count + 2);
  }
  return env;
}

// On Windows, convert C:\foo\bar to /c/foo/bar for Git Bash compatibility
function toUnixPath(p) {
  if (!isWin) return p;
  return p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, "/");
}

const bashScriptPath = isWin ? toUnixPath(scriptPath) : scriptPath;
const t0 = Date.now();
const res = spawnSync(bash, [bashScriptPath], {
  input,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  windowsHide: true,
  env: repoLocalGitEnv(),
  cwd: process.cwd(),
});

if (res.stdout) {
  process.stdout.write(res.stdout);
}
if (res.stderr) {
  process.stderr.write(res.stderr);
}

try {
  audit.recordShellHook({
    scriptPath,
    exitCode: res.status === null ? 1 : res.status,
    durationMs: Date.now() - t0,
    stdinRaw: input,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  });
} catch {
  /* never break hooks for audit failures */
}

const code = res.status === null ? 1 : res.status;
process.exit(code);
