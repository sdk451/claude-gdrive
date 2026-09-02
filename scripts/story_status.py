#!/usr/bin/env python3
"""Story queue and status-board helper for autonomous SWE kit projects.

Story frontmatter is the source of truth. This script reads
project/requirements/*.md, derives epic/project rollups, writes the human
dashboard at project/implementation/_implementation_status.md, and emits the
exact story queue for /autonomous project/epic/story runs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "docs" / "config.yaml"

STORY_STATUSES = {
    "ready-for-dev",
    "in-progress",
    "in-review",
    "done",
    "blocked",
    "ci-blocked",
    "review-blocked",
    "regression-blocked",
    "linear-sync-pending",
}

ACTIVE_STATUSES = {"in-progress", "in-review"}
BLOCKED_STATUSES = {
    "blocked",
    "ci-blocked",
    "review-blocked",
    "regression-blocked",
    "linear-sync-pending",
}
TERMINAL_BLOCKS = {"regression-blocked"}


@dataclass(frozen=True)
class Settings:
    project_name: str
    requirements_path: Path
    implementation_path: Path


# ─────────────────────────────────────────────────────────────────────────────
# WORK HIERARCHY
#
# The hierarchy used to be a string split: "E12-S3".split("-S")[0] -> "E12".
# That hard-codes Scrum's two levels into an id convention, so a SAFe estate
# (capability -> feature -> story) or any three-level shape could not be
# represented at all.
#
# It is now data. `.swekit/hierarchy.yaml` declares the levels; the parent
# of an id is that id with its last segment removed, which generalises to any
# depth. Exactly one level is `buildable` - the autonomous loop runs there and
# only there, whatever it is called - and the composition gate binds to the
# level ABOVE it rather than to the literal word "epic".
#
# Absent a profile the default is the previous behaviour, so nothing changes for
# a repo that has not opted in.
HIERARCHY_REL = ".swekit/hierarchy.yaml"

DEFAULT_HIERARCHY = {
    "levels": [
        {"id": "epic", "prefix": "E", "parent": None},
        {"id": "story", "prefix": "S", "parent": "epic", "buildable": True},
    ]
}

_HIERARCHY_CACHE: dict | None = None


def load_hierarchy(root: Path | None = None) -> dict:
    """Read the hierarchy profile, falling back to the two-level default."""
    global _HIERARCHY_CACHE
    if _HIERARCHY_CACHE is not None:
        return _HIERARCHY_CACHE
    base = root or Path.cwd()
    path = base / HIERARCHY_REL
    profile = DEFAULT_HIERARCHY
    if path.exists():
        # The file EXISTS, so someone configured a hierarchy deliberately. Falling
        # back to the Scrum default here would build at the wrong level under SAFe
        # and say so only on stderr, where nothing reads it - the story would look
        # like it completed correctly. A configuration that cannot be honoured is
        # an error, not a default.
        try:
            import yaml
        except ImportError:
            raise SystemExit(
                f"story_status: {HIERARCHY_REL} exists but PyYAML is not installed, so the\n"
                f"  hierarchy it declares cannot be read. Falling back to the default would\n"
                f"  build at the wrong level. Install it (`pip install pyyaml`) or remove\n"
                f"  {HIERARCHY_REL} to accept the default hierarchy explicitly."
            )
        # A malformed profile does NOT halt the queue - an agent mid-run cannot fix
        # a config file, and stopping the loop is worse than proceeding on the
        # default. This is deliberate; see test_a_malformed_profile_does_not_halt_
        # the_queue. It differs from the missing-PyYAML case above, which is an
        # environment error the operator fixes in seconds.
        try:
            loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception as exc:  # noqa: BLE001 - a bad profile must not halt the queue
            print(f"story_status: {HIERARCHY_REL} is not valid YAML ({exc}); using the "
                  f"default hierarchy", file=sys.stderr)
            loaded = {}
        if loaded and not loaded.get("levels"):
            print(f"story_status: {HIERARCHY_REL} declares no `levels`; using the default "
                  f"hierarchy", file=sys.stderr)
        if loaded.get("levels"):
            profile = loaded
    _HIERARCHY_CACHE = profile
    return profile


def buildable_level(root: Path | None = None) -> dict:
    """The one level the autonomous loop builds at."""
    levels = load_hierarchy(root)["levels"]
    for lv in levels:
        if lv.get("buildable"):
            return lv
    return levels[-1]


def composition_level(root: Path | None = None) -> dict | None:
    """The level whose close triggers the composition gate - buildable + 1.

    Under Scrum that is the epic; under SAFe it is the feature. Binding the gate
    here rather than to the word "epic" is what makes one gate correct in both.
    """
    levels = load_hierarchy(root)["levels"]
    b = buildable_level(root)
    parent = b.get("parent")
    return next((lv for lv in levels if lv["id"] == parent), None)


def parent_id(item_id: str) -> str:
    """Strip the last `-<PREFIX><n>` segment: C4-F12-S3 -> C4-F12, E12-S3 -> E12."""
    parts = item_id.split("-")
    return "-".join(parts[:-1]) if len(parts) > 1 else item_id


@dataclass
class Story:
    path: Path
    fields: dict[str, str]
    body: str

    @property
    def id(self) -> str:
        return self.fields.get("id") or self.path.stem

    @property
    def epic(self) -> str:
        """The parent work item, whatever the customer's hierarchy calls it.

        Kept named `epic` so every existing caller and every story frontmatter
        key keeps working; `parent` is the neutral alias.
        """
        return self.fields.get("epic") or self.fields.get("parent") or parent_id(self.id)

    @property
    def parent(self) -> str:
        return self.epic

    @property
    def title(self) -> str:
        return self.fields.get("title") or self.id

    @property
    def status(self) -> str:
        return normalize_status(self.fields.get("status", "ready-for-dev"))

    @property
    def dependencies(self) -> list[str]:
        return parse_list(self.fields.get("dependencies", "[]"))


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Frontmatter(dict):
    """A frontmatter field map that remembers how it was written.

    Subclasses `dict` so every existing caller keeps working unchanged -
    `fields["id"]`, `.get()`, `.items()`, `in` - while carrying the original
    lines alongside, so `format_frontmatter` can reproduce an untouched field
    exactly as the author wrote it.

    The alternative was a module-level or function-attribute cache, which is
    shared mutable state and breaks the moment two files are parsed before
    either is rendered.
    """

    __slots__ = ("raw",)

    def __init__(self, *args, raw=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.raw = raw if raw is not None else {}


def strip_comment(value: str) -> str:
    """Strip a trailing `# comment`, but never one inside a quoted scalar.

    The previous version split on the first `#` unconditionally, so
    `notes: "has a # hash inside quotes"` was truncated to `has a`. A `#` only
    begins a comment when it is outside quotes and follows whitespace.
    """
    out: list[str] = []
    quote = None
    i = 0
    while i < len(value):
        ch = value[i]
        if quote:
            out.append(ch)
            if _quote_escapes(value, i, quote):
                out.append(value[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in ('"', "'"):
            quote = ch
            out.append(ch)
        elif ch == "#" and (not out or out[-1].isspace()):
            break
        else:
            out.append(ch)
        i += 1
    return "".join(out).strip().strip('"').strip("'")


def parse_frontmatter(text: str) -> tuple[Frontmatter, str]:
    """Parse frontmatter, preserving multi-line values.

    Returns `(fields, body)` as before - `fields` is a dict - so callers are
    unaffected.

    The previous version treated every line as an independent `key: value`, so
    a block sequence

        spec_refs:
          - docs/a.md
          - docs/b.md

    parsed to `spec_refs: ""`, and `format_frontmatter` wrote that back. Both
    paths were destroyed on every `set-status` call, silently, because the file
    still looked well-formed afterwards.

    A continuation line - indented, or a `- ` item - belongs to the key that
    opened the block and is joined with newlines.
    """
    text = text.lstrip("\ufeff")
    if not text.startswith("---\n"):
        return Frontmatter(), text
    end = text.find("\n---", 4)
    if end == -1:
        return Frontmatter(), text
    front = text[4:end].strip("\n")
    body = text[end + 4 :].lstrip("\n")

    fields: dict[str, str] = {}
    raw: dict[str, list[str]] = {}
    current: str | None = None
    open_quote: str | None = None

    for line in front.splitlines():
        stripped = line.strip()

        # Checked BEFORE the blank/comment skip: an open quoted scalar owns blank
        # lines and `#` lines too, and skipping them silently reshaped the value.
        # A quoted scalar whose closing quote is on a later line owns every line
        # until it closes - including blank ones and lines that look like a new
        # `key:`. Without this, a `notes: "..."` spanning lines came back as a
        # sequence with its blank lines dropped.
        if open_quote is not None:
            raw[current].append(line)
            fields[current] = fields[current] + "\n" + line
            if _closes_quote(line, open_quote):
                open_quote = None
                fields[current] = strip_comment(fields[current])
            continue

        if not stripped or stripped.startswith("#"):
            continue

        is_item = stripped.startswith("- ")
        indented = line[:1].isspace()

        if current is not None and (indented or is_item):
            raw[current].append(line)
            piece = stripped[2:].strip() if is_item else stripped
            existing = fields[current]
            fields[current] = f"{existing}\n{piece}" if existing else piece
            continue

        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        raw[key] = [line]
        current = key
        open_quote = _opens_quote(value)
        if open_quote:
            fields[key] = value.strip()
        elif _block_scalar_marker(value):
            # The `>`/`|` header is not part of the value - only the folded/
            # literal content that follows is. Left in, it became a literal
            # first "line" of the field (`notes == ">\n..."`), corrupting
            # every consumer that renders the field as text.
            fields[key] = ""
        else:
            fields[key] = strip_comment(value)

    if open_quote is not None and current is not None:
        # Malformed frontmatter: a quoted scalar was opened but never closed.
        # The keys that followed were folded into its value and cannot be
        # recovered here, but the field must not carry the literal opening
        # quote character forever, and the corruption should be visible
        # rather than silently swallowed.
        print(
            f"warning: frontmatter has an unterminated {open_quote!r} quote "
            f"starting at '{current}' - remaining lines were folded into its value",
            file=sys.stderr,
        )
        fields[current] = strip_comment(fields[current])

    return Frontmatter(fields, raw=raw), body


def _quote_escapes(text: str, i: int, quote: str) -> bool:
    """True when `text[i]` is consumed as an escape inside an open `quote` run.

    Double-quoted scalars use backslash escapes (`\\"` does not close them).
    Single-quoted scalars have none in YAML - the only escape is a doubled
    quote (`''`), a literal `'` that does not close the scalar either. Treating
    a lone backslash as an escape inside a single-quoted value (as the
    double-quote rule does) closes the scalar in the wrong place - a single-
    quoted Windows path like `'C:\\Users\\'` never found its real closing quote.
    """
    if quote == '"':
        return text[i] == "\\" and i + 1 < len(text)
    return text[i] == quote and i + 1 < len(text) and text[i + 1] == quote


def _opens_quote(value: str) -> str | None:
    """The quote character left open by `value`, or None if it is balanced."""
    v = value.strip()
    if not v or v[0] not in ('"', "'"):
        return None
    q = v[0]
    return q if not _closes_quote(v[1:], q) else None


def _closes_quote(text: str, quote: str) -> bool:
    """True when `text` contains the closing `quote`, honouring its escape rule.

    Shares `_quote_escapes` with `strip_comment` so both agree on what counts
    as an escaped character inside a quoted scalar.
    """
    i = 0
    while i < len(text):
        if _quote_escapes(text, i, quote):
            i += 2
            continue
        if text[i] == quote:
            return True
        i += 1
    return False


def _block_scalar_marker(value: str) -> bool:
    """True when `value` is a folded (`>`) or literal (`|`) scalar header."""
    v = value.strip()
    return v.startswith(">") or v.startswith("|")


def _is_block_scalar(original: list[str]) -> bool:
    """True when the key opened a folded/literal scalar rather than a sequence."""
    if not original:
        return False
    return _block_scalar_marker(original[0].split(":", 1)[1])


def _is_quoted_scalar(original: list[str]) -> bool:
    """True when the key opened a quoted scalar that closed on a later line."""
    if len(original) < 2:
        return False
    return _opens_quote(original[0].split(":", 1)[1]) is not None


def _unchanged(original: list[str], value: str) -> bool:
    """True when `value` is exactly what `original` already says."""
    if len(original) == 1:
        return strip_comment(original[0].split(":", 1)[1]) == value
    if _is_quoted_scalar(original):
        # Rebuilt the way parse_frontmatter accumulates it, then comment-stripped.
        joined = original[0].split(":", 1)[1] + "\n" + "\n".join(original[1:])
        return strip_comment(joined) == value
    parts = []
    for line in original[1:]:
        s = line.strip()
        parts.append(s[2:].strip() if s.startswith("- ") else s)
    return "\n".join(parts) == value


def format_frontmatter(fields: dict[str, str]) -> str:
    """Render frontmatter, reproducing untouched fields exactly.

    A field whose value has not changed is written back from its original
    lines, so a multi-line block survives a round trip byte-for-byte. Only a
    field that actually changed is re-rendered - and a multi-line value is
    re-rendered as a block sequence rather than flattened onto one line.
    """
    raw = getattr(fields, "raw", {}) or {}
    lines = ["---"]
    for key, value in fields.items():
        original = raw.get(key)
        if original is not None and _unchanged(original, value):
            lines.extend(original)
        elif key == "dependencies":
            lines.append(f"{key}: [" + ", ".join(parse_list(value)) + "]")
        elif "\n" in value:
            # A multi-line value that was NOT a block sequence - a folded or
            # literal scalar (`notes: >`) or a quoted scalar spanning lines -
            # must not be re-rendered as a list. Its shape is recorded when it
            # was parsed; without this, `notes: >` came back as `notes:`
            # followed by `- ` items, which is a different document.
            if raw.get(key) and (_is_block_scalar(raw[key]) or _is_quoted_scalar(raw[key])):
                # The value changed, so the stale original lines cannot be
                # reused - that silently discarded every edit to a folded,
                # literal or quoted scalar. Render the NEW content as a
                # literal block scalar: it needs no escaping and is lossless
                # for arbitrary text.
                lines.append(f"{key}: |")
                lines.extend(f"  {item}" for item in value.split("\n"))
            else:
                lines.append(f"{key}:")
                lines.extend(f"  - {item}" for item in value.split("\n"))
        elif value == "":
            lines.append(f'{key}: ""')
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def read_config() -> Settings:
    raw: dict[str, str] = {}
    if CONFIG.exists():
        for line in CONFIG.read_text(encoding="utf-8-sig").splitlines():
            if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
                continue
            key, value = line.split(":", 1)
            raw[key.strip()] = strip_comment(value)
    project_name = raw.get("project_name") or ROOT.name
    requirements = raw.get("requirements_path", "project/requirements")
    implementation = raw.get("implementation_path", "project/implementation")
    return Settings(
        project_name=project_name,
        requirements_path=resolve_project_path(requirements),
        implementation_path=resolve_project_path(implementation),
    )


def resolve_project_path(value: str) -> Path:
    path = Path(strip_comment(value))
    return path if path.is_absolute() else ROOT / path


def parse_list(raw: str) -> list[str]:
    value = strip_comment(str(raw or ""))
    if not value or value == "[]":
        return []
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    return [item.strip().strip('"').strip("'") for item in value.split(",") if item.strip()]


def normalize_status(value: str) -> str:
    normalized = str(value or "").strip().casefold().replace("_", "-")
    aliases = {
        "todo": "ready-for-dev",
        "backlog": "ready-for-dev",
        "ready": "ready-for-dev",
        "started": "in-progress",
        "in progress": "in-progress",
        "review": "in-review",
        "in review": "in-review",
        "complete": "done",
        "completed": "done",
        "linear-sync": "linear-sync-pending",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in STORY_STATUSES:
        raise SystemExit(
            f"Invalid story status {value!r}. Expected one of: {', '.join(sorted(STORY_STATUSES))}"
        )
    return normalized


def story_sort_key(story_id: str) -> list[Any]:
    return [int(n) if n.isdigit() else n for n in re.split(r"(\d+)", story_id)]


def load_stories(settings: Settings) -> list[Story]:
    stories: list[Story] = []
    for path in sorted(settings.requirements_path.glob("E*-S*.md"), key=lambda p: story_sort_key(p.stem)):
        fields, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        if not fields:
            continue
        fields.setdefault("id", path.stem)
        fields.setdefault("epic", path.stem.split("-S", 1)[0])
        fields.setdefault("title", path.stem)
        fields["status"] = normalize_status(fields.get("status", "ready-for-dev"))
        stories.append(Story(path=path, fields=fields, body=body))
    return stories


def parse_epic_names(settings: Settings) -> dict[str, str]:
    epics_path = settings.requirements_path / "epics.md"
    if not epics_path.exists():
        return {}
    names: dict[str, str] = {}
    for line in epics_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"^##\s+(E\d+)(?:\s+[-\u2014]\s+|\s+)(.*)$", line.strip())
        if m:
            names[m.group(1)] = m.group(2).strip() or m.group(1)
    return names


def epic_status(stories: list[Story]) -> str:
    if not stories:
        return "not-started"
    statuses = [s.status for s in stories]
    if all(s == "done" for s in statuses):
        return "done"
    if any(s in TERMINAL_BLOCKS for s in statuses):
        return "regression-blocked"
    if any(s in BLOCKED_STATUSES for s in statuses):
        return "blocked"
    if any(s in ACTIVE_STATUSES for s in statuses) or any(s == "done" for s in statuses):
        return "in-progress"
    return "not-started"


def dependencies_done(story: Story, by_id: dict[str, Story]) -> tuple[bool, list[str]]:
    missing_or_open: list[str] = []
    for dep in story.dependencies:
        dep_story = by_id.get(dep)
        if not dep_story or dep_story.status != "done":
            missing_or_open.append(dep)
    return not missing_or_open, missing_or_open


def select_target_stories(stories: list[Story], target: str) -> list[Story]:
    target = target.strip()
    if re.fullmatch(r"E\d+-S\d+", target, flags=re.I):
        return [s for s in stories if s.id.casefold() == target.casefold()]
    if re.fullmatch(r"E\d+", target, flags=re.I):
        return [s for s in stories if s.epic.casefold() == target.casefold()]
    return stories


def build_queue(stories: list[Story], target: str) -> dict[str, Any]:
    selected = select_target_stories(stories, target)
    by_id = {s.id: s for s in stories}
    queue: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    blocked = [s for s in stories if s.status in TERMINAL_BLOCKS]
    for story in selected:
        deps_ok, unmet = dependencies_done(story, by_id)
        item = {
            "id": story.id,
            "epic": story.epic,
            "title": story.title,
            "status": story.status,
            "path": story.path.relative_to(ROOT).as_posix(),
            "dependencies": story.dependencies,
        }
        if story.status == "ready-for-dev" and deps_ok and not blocked:
            queue.append(item)
        else:
            reason = "not-ready-status"
            if story.status == "done":
                reason = "done"
            elif story.status in ACTIVE_STATUSES:
                reason = "active"
            elif story.status in BLOCKED_STATUSES:
                reason = story.status
            elif unmet:
                reason = "unmet-dependencies"
                item["unmet_dependencies"] = unmet
            elif blocked:
                reason = "terminal-block-present"
            item["reason"] = reason
            skipped.append(item)
    return {
        "target": target,
        "queue": queue,
        "skipped": skipped,
        "terminal_blocks": [s.id for s in blocked],
    }


def counts(stories: list[Story]) -> dict[str, int]:
    data = {status: 0 for status in sorted(STORY_STATUSES)}
    for story in stories:
        data[story.status] = data.get(story.status, 0) + 1
    data["total"] = len(stories)
    return data


def status_badge(status: str) -> str:
    return {
        "ready-for-dev": "READY",
        "in-progress": "ACTIVE",
        "in-review": "REVIEW",
        "done": "DONE",
        "blocked": "BLOCKED",
        "ci-blocked": "CI-BLOCKED",
        "review-blocked": "REVIEW-BLOCKED",
        "regression-blocked": "REGRESSION-BLOCKED",
        "linear-sync-pending": "LINEAR-SYNC-PENDING",
        "not-started": "NOT-STARTED",
    }.get(status, status.upper())


def field(story: Story, key: str) -> str:
    return story.fields.get(key, "").strip() or "-"


def render_status(settings: Settings, stories: list[Story]) -> str:
    now = utc_now()
    c = counts(stories)
    done = c.get("done", 0)
    total = c.get("total", 0)
    pct = int(round((done / total) * 100)) if total else 0
    epics = sorted({s.epic for s in stories}, key=story_sort_key)
    epic_names = parse_epic_names(settings)
    active = [s for s in stories if s.status in ACTIVE_STATUSES]
    blocked = [s for s in stories if s.status in BLOCKED_STATUSES]

    lines = [
        f"# Implementation Status - {settings.project_name}",
        "",
        "> Auto-generated from story frontmatter by `python scripts/story_status.py render-status --write`.",
        f"> Last updated: {now}",
        "",
        "## Summary",
        "",
        "| Status | Count |",
        "| --- | ---: |",
        f"| Total stories | {total} |",
        f"| Done | {done} |",
        f"| In progress | {c.get('in-progress', 0)} |",
        f"| In review | {c.get('in-review', 0)} |",
        f"| Ready for dev | {c.get('ready-for-dev', 0)} |",
        f"| Blocked | {sum(c.get(s, 0) for s in BLOCKED_STATUSES)} |",
        "",
        f"Build progress: {pct}%",
        "",
        "## Current story",
        "",
    ]
    if active:
        lines += [
            "| Story | Title | Status | Branch | PR | Phase |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for s in active:
            lines.append(
                f"| {s.id} | {s.title} | {status_badge(s.status)} | {field(s, 'branch')} | {field(s, 'pr')} | {field(s, 'phase')} |"
            )
    else:
        lines.append("*None in progress*")
    lines += ["", "## Epics", ""]
    if epics:
        lines += [
            "| Epic | Status | Done | Active | Ready | Blocked | Total |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ]
        for epic in epics:
            members = [s for s in stories if s.epic == epic]
            ec = counts(members)
            name = epic_names.get(epic, epic)
            lines.append(
                f"| {epic} - {name} | {status_badge(epic_status(members))} | {ec.get('done', 0)} | {ec.get('in-progress', 0) + ec.get('in-review', 0)} | {ec.get('ready-for-dev', 0)} | {sum(ec.get(s, 0) for s in BLOCKED_STATUSES)} | {ec.get('total', 0)} |"
            )
        for epic in epics:
            name = epic_names.get(epic, epic)
        # Per-story detail is emitted only for epics with active work, and for a
        # bounded window of the rest. An earlier version wrote every story of every
        # epic as a table row: on a mature project that reached 1,129 rows and
        # 240k tokens - larger than an agent's whole context window, so reading the
        # dashboard compacted the session on that single read (DF-BUG-5). The full
        # record still lives in the per-story frontmatter; this file is a dashboard,
        # not the database, and a dashboard nobody can open is not one.
        DETAIL_CAP = 200  # rows of per-story detail before we summarise the rest

        active_epics = {s.epic for s in stories if s.status in ACTIVE_STATUSES}
        blocked_epics = {s.epic for s in stories if s.status in BLOCKED_STATUSES}
        # Order: epics needing attention first, so the detail budget is spent where
        # it matters rather than on long-closed work.
        ordered = sorted(
            epics,
            key=lambda e: (e not in active_epics, e not in blocked_epics, story_sort_key(e)),
        )

        rows_emitted = 0
        summarised = []
        for epic in ordered:
            name = epic_names.get(epic, epic)
            members = [story for story in stories if story.epic == epic]
            ec = counts(members)
            is_active = epic in active_epics or epic in blocked_epics
            # A fully-done epic with no active or blocked story is a rollup line,
            # never a table - its detail is history and re-derivable from frontmatter.
            if not is_active and rows_emitted >= DETAIL_CAP:
                summarised.append((epic, name, ec, len(members)))
                continue
            lines += ["", f"### {epic} - {name}", "", "| Story | Title | Status | Branch | PR | Phase | Linear | Notes |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
            for s in members:
                linear = field(s, "linear_issue")
                notes = field(s, "notes")
                lines.append(
                    f"| {s.id} | {s.title} | {status_badge(s.status)} | {field(s, 'branch')} | {field(s, 'pr')} | {field(s, 'phase')} | {linear} | {notes} |"
                )
            rows_emitted += len(members)

        if summarised:
            lines += [
                "",
                f"### Completed epics ({len(summarised)}, detail omitted to stay within context budget)",
                "",
                "| Epic | Done | Total |",
                "| --- | ---: | ---: |",
            ]
            for epic, name, ec, total_members in summarised:
                lines.append(f"| {epic} - {name} | {ec.get('done', 0)} | {total_members} |")
            lines += ["", "*Per-story detail for completed epics is in the story frontmatter under "
                      "`project/requirements/`. Run `story_status.py show <epic>` for one epic's table.*"]
    else:
        lines.append("*No stories found*")
    lines += ["", "## Blocked stories", ""]
    if blocked:
        lines += ["| Story | Title | Status | Notes |", "| --- | --- | --- | --- |"]
        for s in blocked:
            lines.append(f"| {s.id} | {s.title} | {status_badge(s.status)} | {field(s, 'notes')} |")
    else:
        lines.append("*None*")
    lines += ["", "## Advisor log", "", "<!-- Auto-populated by /swe-advisor -->", ""]
    return "\n".join(lines)


def replace_or_add_field(fields: dict[str, str], key: str, value: str | None) -> None:
    if value is not None:
        fields[key] = value


def _build_record_cell(value: str) -> str:
    """Make a value safe to sit in a markdown table cell.

    A markdown table cell cannot contain a raw newline, and an unescaped pipe
    ends the cell. Writing either produces a row that this function can never
    match again on the next call - which is exactly how the duplicate-row
    corruption started: the row was written, became unmatchable, and every
    later update appended another one beside it.

    Newlines collapse to a space rather than `<br>`: the build record is read
    far more often as plain text (diffs, terminals, greps) than as rendered
    markdown, and a literal `<br>` is noise in all three.
    """
    text = str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = " ".join(segment.strip() for segment in text.split("\n") if segment.strip())
    return text.replace("|", r"\|")


def _strip_rows(lines: list[str], label: str) -> list[str]:
    """Drop every row for `label`, including continuation lines from a corrupt one.

    Removes ALL of them rather than the first, so a file already carrying
    duplicates is repaired by the next ordinary update instead of needing a
    separate migration.

    A row runs from `| Label |` up to - but not including - the next line that
    starts a new row, closes the table, or opens a new section. That is what
    lets a wrapped value be recognised and removed, where the old
    `^\\| Label \\| .*\\|$` could not see past the first line.
    """
    out: list[str] = []
    index = 0
    prefix = f"| {label} |"
    while index < len(lines):
        if lines[index].startswith(prefix):
            index += 1
            while index < len(lines):
                nxt = lines[index]
                if nxt.startswith("|") or not nxt.strip() or nxt.startswith("#"):
                    break
                index += 1
            continue
        out.append(lines[index])
        index += 1
    return out


def update_build_record(body: str, updates: dict[str, str]) -> str:
    if "## Build record" not in body:
        body = body.rstrip() + "\n\n---\n\n<!-- DO NOT EDIT BELOW - auto-maintained by autonomous build -->\n\n## Build record\n\n| Field | Value |\n|-------|-------|\n"
    field_labels = {
        "branch": "Branch",
        "started": "Started",
        "completed": "Completed",
        "pr": "PR",
        "ci_run": "CI run",
        "phase": "Phase",
        "notes": "Notes",
    }

    lines = body.split("\n")

    # SCOPED TO THE BUILD RECORD SECTION, not the whole body.
    #
    # Row matching is by `| Label |` prefix, and that prefix is not unique to
    # this table. tmk-intelligence and tmk-infra-intelligence both hold epic
    # tables whose HEADER row reads `| Phase | Theme | Stories |` - which starts
    # with `| Phase |` and would otherwise be stripped as a stale build record
    # row, destroying an unrelated table's header. Found by scanning the estate
    # before rollout: 7 files would have been damaged.
    try:
        start = next(i for i, ln in enumerate(lines) if ln.startswith("## Build record"))
    except StopIteration:  # pragma: no cover - the guard above guarantees it
        return body
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break
    head, section, tail = lines[:start + 1], lines[start + 1:end], lines[end:]

    for key, value in updates.items():
        if value is None:
            continue
        label = field_labels.get(key, key.replace("_", " ").title())
        cell = _build_record_cell(value) or "-"
        row = f"| {label} | {cell} |"

        section = _strip_rows(section, label)

        # Insert at the end of the TABLE. The old code appended to
        # `body.rstrip()` - the end of the BODY - so whenever the build record
        # was not the last thing in the file, the row landed after whatever
        # followed it, outside any table, in the middle of prose.
        insert_at = 0
        for i, ln in enumerate(section):
            if ln.startswith("|"):
                insert_at = i + 1
        section.insert(insert_at, row)

    return "\n".join(head + section + tail)


def write_story(story: Story) -> None:
    story.path.write_text(format_frontmatter(story.fields) + story.body, encoding="utf-8")


def set_status(args: argparse.Namespace, settings: Settings) -> None:
    stories = load_stories(settings)
    by_id = {s.id: s for s in stories}
    story = by_id.get(args.story_id)
    if not story:
        raise SystemExit(f"Unknown story {args.story_id}")
    status = normalize_status(args.status)
    replace_or_add_field(story.fields, "status", status)
    replace_or_add_field(story.fields, "branch", args.branch)
    replace_or_add_field(story.fields, "pr", args.pr)
    replace_or_add_field(story.fields, "ci_run", args.ci_run)
    replace_or_add_field(story.fields, "phase", args.phase)
    replace_or_add_field(story.fields, "notes", args.notes)
    replace_or_add_field(story.fields, "linear_issue", args.linear_issue)
    replace_or_add_field(story.fields, "linear_url", args.linear_url)
    now = utc_now()
    updates = {
        "branch": story.fields.get("branch", ""),
        "pr": story.fields.get("pr", ""),
        "ci_run": story.fields.get("ci_run", ""),
        "phase": story.fields.get("phase", ""),
        "notes": story.fields.get("notes", ""),
    }
    if status == "in-progress" and not story.fields.get("started"):
        story.fields["started"] = now
        updates["started"] = now
    if status == "done":
        story.fields["completed"] = now
        updates["completed"] = now
    story.body = update_build_record(story.body, updates)
    write_story(story)
    render_status_to_file(settings)
    print(f"{story.id}: {status}")


STATUS_TIMESTAMP_PREFIX = "> Last updated: "


def strip_status_timestamp(text: str) -> str:
    """The rendered board minus its clock line.

    Used to answer "did anything real change?". Everything else in the board is
    derived from story frontmatter, so if the rest matches byte for byte the
    only difference is the timestamp.
    """
    return "\n".join(
        line
        for line in text.splitlines()
        if not line.startswith(STATUS_TIMESTAMP_PREFIX)
    )


def render_status_to_file(settings: Settings) -> Path:
    """Render the board, but only write when something other than the clock moved.

    The board is committed deliberately (stories are marked done and the board
    re-rendered in the same commit), so it has to stay tracked. But rendering
    stamps `Last updated` unconditionally, which means any run -- a status
    check, a dry read, a tool that renders on open -- dirties the working tree
    with a one-line diff that carries no information.

    That is not cosmetic. A tree that is always dirty trains everyone to stash
    reflexively before switching branches, and stashes are where work goes to
    be forgotten. This repository accumulated thirteen of them; ten were this
    exact one-line diff, and one of the remaining three was the only copy of a
    security fix.

    Writing only on a real change makes the render idempotent: run it twice,
    get one diff. `git status` then means what it says.
    """
    stories = load_stories(settings)
    settings.implementation_path.mkdir(parents=True, exist_ok=True)
    path = settings.implementation_path / "_implementation_status.md"
    rendered = render_status(settings, stories)

    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if strip_status_timestamp(existing) == strip_status_timestamp(rendered):
            return path

    path.write_text(rendered, encoding="utf-8")
    return path



def validate(stories: list[Story]) -> dict[str, Any]:
    by_id = {s.id: s for s in stories}
    errors: list[str] = []
    for story in stories:
        if story.id != story.path.stem:
            errors.append(f"{story.path}: id {story.id!r} does not match filename")
        for dep in story.dependencies:
            if dep not in by_id:
                errors.append(f"{story.id}: missing dependency {dep}")
    return {"ok": not errors, "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("queue", help="Emit runnable story queue for a project, epic, or story target")
    q.add_argument("target", help="project name, epic id like E2, or story id like E2-S3")
    q.add_argument("--json", action="store_true", help="Emit JSON")

    r = sub.add_parser("render-status", help="Render implementation status dashboard")
    r.add_argument("--write", action="store_true", help="Write project/implementation/_implementation_status.md")

    s = sub.add_parser("set-status", help="Update story frontmatter status and regenerate dashboard")
    s.add_argument("story_id")
    s.add_argument("status")
    s.add_argument("--branch")
    s.add_argument("--pr")
    s.add_argument("--ci-run")
    s.add_argument("--phase")
    s.add_argument("--notes")
    s.add_argument("--linear-issue")
    s.add_argument("--linear-url")

    sub.add_parser("validate", help="Validate story ids and dependencies")

    args = parser.parse_args()
    settings = read_config()
    stories = load_stories(settings)

    if args.cmd == "queue":
        data = build_queue(stories, args.target)
        if args.json:
            print(json.dumps(data, indent=2))
        else:
            for item in data["queue"]:
                print(f"{item['id']}\t{item['status']}\t{item['path']}")
            if data["terminal_blocks"]:
                print("terminal_blocks: " + ", ".join(data["terminal_blocks"]))
        return 0
    if args.cmd == "render-status":
        if args.write:
            path = render_status_to_file(settings)
            print(path.relative_to(ROOT).as_posix())
        else:
            print(render_status(settings, stories))
        return 0
    if args.cmd == "set-status":
        set_status(args, settings)
        return 0
    if args.cmd == "validate":
        data = validate(stories)
        print(json.dumps(data, indent=2))
        return 0 if data["ok"] else 1
    raise SystemExit(f"unknown command {args.cmd}")


if __name__ == "__main__":
    raise SystemExit(main())
