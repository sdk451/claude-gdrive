#!/usr/bin/env python3
"""Record agent coding/session history in Memori BYODB.

This script is intentionally fail-open: hooks must never block edits just
because a local Python dependency, database, or augmentation key is missing.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Markdown fallback target when session_memory_backend != memori.
MARKDOWN_LOG = Path("docs") / "session-memory.md"


def session_backend(root: Path) -> str:
    """Read session_memory_backend from docs/config.yaml (default: memori).

    Kept to a line scan so the hook has no YAML dependency and stays fail-open.
    """
    config_path = root / "docs" / "config.yaml"
    try:
        for raw in config_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if line.startswith("session_memory_backend:"):
                value = line.split(":", 1)[1].strip().strip('"').strip("'")
                return "markdown" if value == "markdown" else "memori"
    except Exception:
        pass
    return "memori"


def append_markdown(root: Path, memory: str, labels: list[str]) -> None:
    """Append a session-memory entry to docs/session-memory.md (fail-open)."""
    target = root / MARKDOWN_LOG
    target.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    header = "" if target.exists() else "# Session memory\n\n"
    entry = f"## {stamp}\n\n{memory.strip()}\n\n_labels: {', '.join(labels)}_\n\n"
    with target.open("a", encoding="utf-8") as f:
        f.write(header + entry)


def load_dotenv(root: Path) -> None:
    env_path = root / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def git_value(args: list[str], default: str = "") -> str:
    try:
        return subprocess.check_output(["git", *args], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
      return default


def event_name(payload: dict) -> str:
    return str(
        payload.get("hook_event_name")
        or payload.get("hook_event")
        or payload.get("event")
        or ""
    )


def tool_name(payload: dict) -> str:
    return str(payload.get("tool_name") or payload.get("tool") or "")


def significant_file(payload: dict) -> str:
    data = payload.get("tool_input") or {}
    path = str(data.get("file_path") or data.get("path") or "")
    norm = path.replace("\\", "/")
    watched = (
        "docs/designs/",
        "project/requirements/",
        "docs/architecture.md",
        "docs/tech-stack.md",
        "docs/constitution.md",
        "docs/test-strategy.md",
    )
    if path and any(marker in norm for marker in watched):
        return path
    return ""


def get_memori(root: Path):
    from memori import Memori

    db = (
        os.getenv("MEMORI_DATABASE__CONNECTION_STRING")
        or os.getenv("MEMORI_DATABASE_URL")
        or "postgresql://memori:memori_dev@127.0.0.1:5872/memori"
    )
    namespace = os.getenv("MEMORI_MEMORY__NAMESPACE", "autonomous_swe_kit")
    if db.startswith("sqlite:///./"):
        target = root / db.removeprefix("sqlite:///./")
        target.parent.mkdir(parents=True, exist_ok=True)
        db = "sqlite:///" + str(target).replace("\\", "/")
    try:
        return Memori(database_connect=db, namespace=namespace, conscious_ingest=True, auto_ingest=True)
    except TypeError:
        if db.startswith("sqlite:///"):
            sqlite_path = Path(db.removeprefix("sqlite:///"))
            sqlite_path.parent.mkdir(parents=True, exist_ok=True)

            def conn():
                return sqlite3.connect(sqlite_path)

            return Memori(conn=conn)
        raise


def add_memory(mem, text: str, category: str, labels: list[str]) -> None:
    if hasattr(mem, "add_memory"):
        mem.add_memory(text, category=category, labels=labels)
        return
    if hasattr(mem, "remember"):
        mem.remember(text)
        return
    raise AttributeError("Memori object exposes neither add_memory nor remember")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdin-json", action="store_true")
    args = parser.parse_args()

    root = Path.cwd()
    load_dotenv(root)

    try:
        payload = json.loads(os.sys.stdin.read() or "{}") if args.stdin_json else {}
    except Exception:
        payload = {}

    event = event_name(payload)
    tool = tool_name(payload)
    branch = git_value(["branch", "--show-current"], "main")
    story = ""
    for part in branch.replace("/", "-").split("-"):
        if part.isdigit():
            break
    persona = os.getenv("CLAUDE_AGENT_NAME") or os.getenv("CURSOR_AGENT_NAME") or os.getenv("CODEX_AGENT_NAME") or "agent"
    entity = os.getenv("MEMORI_ENTITY_ID", os.getenv("USER", os.getenv("USERNAME", "developer")))
    process = f"autonomous-swe-kit:{persona}"

    summary_path = root / ".cursor" / "session-summary.md"
    file_path = significant_file(payload)
    memory = ""
    labels = ["autonomous-swe-kit", f"branch:{branch}", f"entity:{entity}", f"process:{process}"]

    if event.lower() == "stop" and summary_path.exists():
        summary = summary_path.read_text(encoding="utf-8", errors="ignore").strip()
        if summary:
            memory = f"Session summary by {persona} on {branch}:\n{summary}"
            labels.append("session-summary")
            summary_path.write_text("", encoding="utf-8")
    elif event.lower() in {"posttooluse", "post_tool_use", "posttool"} and tool in {"Write", "Edit"} and file_path:
        memory = f"{persona} {tool.lower()}d significant project file on {branch}: {file_path}"
        labels.extend(["code-change", f"file:{file_path.replace(chr(92), '/')}"])

    if not memory:
        return 0

    if session_backend(root) == "markdown":
        try:
            append_markdown(root, memory, labels)
        except Exception:
            pass
        return 0

    try:
        mem = get_memori(root)
        add_memory(mem, memory, category="agent-session", labels=labels)
    except Exception as exc:
        # Record the failure without dirtying the working tree on every run.
        #
        # This log was appended to unconditionally: the same line - most often a
        # broken grpc install: `ImportError: cannot import name 'cygrpc'` - was
        # written on every Stop hook, growing the file and leaving one
        # uncommitted diff after each session. And it lived under docs/, so it was
        # tracked, so the noise was a committable change nobody wanted to commit.
        #
        # Two fixes here; the third is the .gitignore that keeps it out of version
        # control. This one bounds the file and dedupes the tail, so a recurring
        # error is recorded once rather than a thousand times.
        _log_hook_error(root, exc)
    return 0


def _log_hook_error(root: Path, exc: Exception) -> None:
    """Append a hook error, but only if it differs from the last line, and cap
    the file. A failing hook must never grow an unbounded log or spam identical
    lines - the log is a signal, and a signal repeated a thousand times is noise.
    """
    try:
        audit_dir = root / "docs" / "agent-audit"
        audit_dir.mkdir(parents=True, exist_ok=True)
        line = f"{type(exc).__name__}: {exc}"
        log = audit_dir / "memori-hook-errors.log"

        existing = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
        # Same error as last time: bump a count on the tail rather than appending.
        if existing and existing[-1].startswith(line):
            # `<line>  (xN)` - increment N, or start at 2.
            import re as _re
            m = _re.search(r"  \(x(\d+)\)$", existing[-1])
            n = (int(m.group(1)) + 1) if m else 2
            existing[-1] = f"{line}  (x{n})"
        else:
            existing.append(line)
        # Keep the file bounded: the last 50 distinct errors are plenty to diagnose.
        existing = existing[-50:]
        log.write_text("\n".join(existing) + "\n", encoding="utf-8")
    except Exception:
        # Logging the error must never itself raise - the hook is fail-open.
        pass


if __name__ == "__main__":
    raise SystemExit(main())
