import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function decodeMaybeUtf16le(buf: Buffer | string | null | undefined): string {
  if (!buf) return "";
  if (typeof buf === "string") return buf;
  if (buf.length >= 2) {
    let nulCount = 0;
    for (let i = 1; i < buf.length; i += 2) {
      if (buf[i] === 0) nulCount++;
    }
    if (nulCount > buf.length / 8) return buf.toString("utf16le");
  }
  return buf.toString("utf8");
}

function tryGetExecutable(cmd: string): string | null {
  const which = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(which, [cmd], { encoding: "utf8" });
  if (res.status === 0) return cmd;
  return null;
}

describe("verify-completion-promise hook", () => {
  it("returns {} when STORY_COMPLETE is present and targeted runner succeeds", () => {
    // This integration test exercises the Bash hook directly (CI runs on linux).
    // Windows local environments vary widely (Git Bash/jq availability), so skip there.
    if (process.platform === "win32") return;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vcp-hook-"));
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo, { recursive: true });

    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], {
      cwd: repo,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "test"], { cwd: repo, stdio: "ignore" });
    fs.writeFileSync(path.join(repo, "README.md"), "x\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "TOK-999/test"], { cwd: repo, stdio: "ignore" });

    fs.mkdirSync(path.join(repo, ".cursor"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".cursor", "scratchpad.md"), "STORY_COMPLETE\n", "utf8");

    fs.mkdirSync(path.join(repo, "docs", "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "docs", "tests", "TOK-999-targets.txt"),
      "unit: tests/unit/does-not-matter.test.ts\n",
      "utf8",
    );

    fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "scripts", "run-targeted-tests.sh"),
      "#!/usr/bin/env bash\nexit 0\n",
      "utf8",
    );
    fs.chmodSync(path.join(repo, "scripts", "run-targeted-tests.sh"), 0o755);

    // The Windows hook prefers a PowerShell runner if present (no Git Bash dependency).
    fs.writeFileSync(
      path.join(repo, "scripts", "run-targeted-tests.ps1"),
      "param([string]$targetsFile)\nexit 0\n",
      "utf8",
    );

    const input = JSON.stringify({ loop_count: 0 });

    const bash = tryGetExecutable("bash");
    if (!bash) return;

    fs.mkdirSync(path.join(repo, ".cursor", "hooks"), { recursive: true });
    const hookSrc = path.resolve(".cursor", "hooks", "verify-completion-promise.sh");
    const hookDst = path.join(repo, ".cursor", "hooks", "verify-completion-promise.sh");
    fs.copyFileSync(hookSrc, hookDst);
    fs.chmodSync(hookDst, 0o755);

    const res = spawnSync(bash, [hookDst], { cwd: repo, input, encoding: "utf8" });
    expect(res.status).toBe(0);
    expect((res.stdout ?? "").trim()).toBe("{}");
  });
});
