/**
 * TypeScript source for the hook runner (IMPLEMENTATION-GUIDE §2.11 "wrappers.ts").
 * Runtime: Node 22+ can run with:
 *   node --experimental-strip-types .cursor/hooks/wrappers.ts <path-to-sh>
 * For broader Node / older Cursor, use the CommonJS build:
 *   node .cursor/hooks/run-hook.cjs <path-to-sh>
 *
 * If both .cursor/hooks.json (v1) and .cursor/settings.json (variant B) register hooks
 * in your build, you may get duplicate runs—keep only one source of truth.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const scriptArg = process.argv[2];
if (!scriptArg) {
  process.stderr.write("wrappers.ts: missing path to .sh script\n");
  process.exit(2);
}

const scriptPath = path.isAbsolute(scriptArg)
  ? scriptArg
  : path.resolve(process.cwd(), scriptArg);

if (!existsSync(scriptPath)) {
  process.stderr.write(`wrappers.ts: script not found: ${scriptPath}\n`);
  process.exit(2);
}

let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {
  input = "";
}

const isWin = process.platform === "win32";

function findBash(): string {
  if (process.env.BASH_EXE && existsSync(process.env.BASH_EXE)) {
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
    if (c && existsSync(c)) {
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
const code = res.status === null ? 1 : res.status;
process.exit(code);
