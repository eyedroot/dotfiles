#!/usr/bin/env python3
"""Extract conversation context, plan state, and git worktree info from Claude Code and Codex sessions."""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
CODEX_SESSIONS_DIR = Path.home() / ".codex" / "sessions"

CLAUDE_USER_SKIP_PREFIXES = (
    "<local-command-",
    "<command-name>",
    "<system-reminder>",
)

CODEX_USER_SKIP_PREFIXES = (
    "# AGENTS.md instructions",
    "<environment_context>",
    "<permissions instructions>",
    "<external_codex_apps_",
)


def encode_claude_path(path: str) -> str:
    """Encode a filesystem path using Claude Code's project directory naming convention."""
    return re.sub(r"[^a-zA-Z0-9]", "-", path)


def get_target_paths(cwd: str) -> list[str]:
    """Resolve cwd and all linked git worktree paths."""
    paths: list[str] = []
    seen: set[str] = set()

    def add_path(p: str) -> None:
        if not p:
            return
        for candidate in (os.path.abspath(p), os.path.realpath(p)):
            if candidate not in seen:
                seen.add(candidate)
                paths.append(candidate)

    add_path(cwd)

    try:
        res = subprocess.run(
            ["git", "-C", cwd, "worktree", "list", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if line.startswith("worktree "):
                    wt_path = line[len("worktree ") :].strip()
                    add_path(wt_path)
    except Exception:
        pass

    return paths


def path_matches_targets(candidate: str | None, targets: list[str]) -> bool:
    """Return True if candidate equals or is inside any target path."""
    if not candidate:
        return False
    cand_real = os.path.realpath(candidate)
    cand_abs = os.path.abspath(candidate)
    for t in targets:
        for c in (cand_real, cand_abs):
            if c == t or c.startswith(t.rstrip(os.sep) + os.sep):
                return True
    return False


def format_mtime(mtime: float) -> str:
    """Format a POSIX timestamp in local time."""
    dt = datetime.fromtimestamp(mtime).astimezone()
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def format_size(num_bytes: int) -> str:
    """Format byte size concisely."""
    if num_bytes < 1024:
        return f"{num_bytes}B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f}KB"
    return f"{num_bytes / (1024 * 1024):.1f}MB"


def discover_claude_sessions(targets: list[str]) -> list[dict[str, Any]]:
    """Discover Claude Code .jsonl sessions matching targets or their worktrees."""
    if not CLAUDE_PROJECTS_DIR.is_dir():
        return []

    encoded_targets = [encode_claude_path(p) for p in targets]
    matched_dirs: list[Path] = []
    for entry in CLAUDE_PROJECTS_DIR.iterdir():
        if not entry.is_dir():
            continue
        name = entry.name
        if any(
            name == enc or name.startswith(f"{enc}--claude-worktrees-")
            for enc in encoded_targets
        ):
            matched_dirs.append(entry)

    sessions: list[dict[str, Any]] = []
    for proj_dir in matched_dirs:
        for jsonl_path in proj_dir.glob("*.jsonl"):
            if not jsonl_path.is_file():
                continue
            stat = jsonl_path.stat()
            sessions.append(
                {
                    "source": "claude",
                    "session_id": jsonl_path.stem,
                    "path": str(jsonl_path),
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                    "project_dir": proj_dir.name,
                    "cwd": None,
                    "title": None,
                }
            )
    return sessions


def peek_codex_meta(path: Path) -> tuple[str | None, str | None]:
    """Read initial lines of a Codex .jsonl file to get (session_id, cwd)."""
    session_id: str | None = None
    cwd: str | None = None
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i > 40:
                    break
                if "session_meta" not in line and "turn_context" not in line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                rtype = rec.get("type")
                payload = rec.get("payload")
                if not isinstance(payload, dict):
                    continue
                if rtype == "session_meta":
                    session_id = payload.get("session_id") or payload.get("id") or session_id
                    cwd = payload.get("cwd") or cwd
                elif rtype == "turn_context":
                    cwd = payload.get("cwd") or cwd
                if session_id and cwd:
                    break
    except OSError:
        pass
    return session_id, cwd


def discover_codex_sessions(targets: list[str], scan_limit: int = 100) -> list[dict[str, Any]]:
    """Discover recent Codex .jsonl sessions matching targets."""
    if not CODEX_SESSIONS_DIR.is_dir():
        return []

    pattern = str(CODEX_SESSIONS_DIR / "*" / "*" / "*" / "*.jsonl")
    candidates = [Path(p) for p in glob.glob(pattern)]
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    candidates = candidates[:scan_limit]

    sessions: list[dict[str, Any]] = []
    for jsonl_path in candidates:
        session_id, cwd = peek_codex_meta(jsonl_path)
        if not path_matches_targets(cwd, targets):
            continue
        stat = jsonl_path.stat()
        sessions.append(
            {
                "source": "codex",
                "session_id": session_id or jsonl_path.stem,
                "path": str(jsonl_path),
                "mtime": stat.st_mtime,
                "size": stat.st_size,
                "project_dir": None,
                "cwd": cwd,
                "title": None,
            }
        )
    return sessions


def extract_claude_user_text(content: Any) -> str:
    """Extract user prompt text from Claude message content, ignoring tool_result and boilerplate."""
    parts: list[str] = []
    if isinstance(content, str):
        stripped = content.strip()
        if stripped and not any(stripped.startswith(p) for p in CLAUDE_USER_SKIP_PREFIXES):
            parts.append(stripped)
    elif isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "text":
                continue
            text = (block.get("text") or "").strip()
            if not text:
                continue
            if any(text.startswith(p) for p in CLAUDE_USER_SKIP_PREFIXES):
                continue
            parts.append(text)
    return "\n\n".join(parts).strip()


def apply_claude_plan_tool(
    plan_items: list[dict[str, str]], tool_name: str, tool_input: dict[str, Any]
) -> list[dict[str, str]]:
    """Update reconstructed plan state from mcp__ccd_turn__update_plan or TodoWrite."""
    if "TodoWrite" in tool_name:
        todos = tool_input.get("todos")
        if isinstance(todos, list):
            return [
                {
                    "content": str(t.get("content", "")),
                    "status": str(t.get("status", "pending")),
                }
                for t in todos
                if isinstance(t, dict)
            ]
        return plan_items

    if "update_plan" in tool_name:
        items = tool_input.get("items")
        if isinstance(items, list):
            plan_items = [
                {
                    "content": str(item.get("content", "")),
                    "status": str(item.get("status", "pending")),
                }
                for item in items
                if isinstance(item, dict)
            ]
        done_indices = tool_input.get("done")
        if isinstance(done_indices, list):
            for idx in done_indices:
                if isinstance(idx, int) and 1 <= idx <= len(plan_items):
                    plan_items[idx - 1]["status"] = "completed"
        start_idx = tool_input.get("start")
        if isinstance(start_idx, int) and 1 <= start_idx <= len(plan_items):
            plan_items[start_idx - 1]["status"] = "in_progress"
    return plan_items


def parse_claude_session(path: str) -> dict[str, Any]:
    """Parse a Claude Code .jsonl file cleanly and quickly."""
    session_id = Path(path).stem
    custom_title: str | None = None
    last_prompt: str | None = None
    cwd: str | None = None
    git_branch: str | None = None
    plan_items: list[dict[str, str]] = []
    modified_files: list[str] = []
    modified_seen: set[str] = set()
    turns: list[dict[str, str]] = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if (
                '"user"' not in line
                and '"assistant"' not in line
                and '"custom-title"' not in line
                and '"last-prompt"' not in line
            ):
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            if rec.get("isSidechain") is True:
                continue

            rtype = rec.get("type")
            if rec.get("sessionId"):
                session_id = rec["sessionId"]
            if rec.get("cwd"):
                cwd = rec["cwd"]
            if rec.get("gitBranch"):
                git_branch = rec["gitBranch"]

            if rtype == "custom-title":
                if rec.get("customTitle"):
                    custom_title = str(rec["customTitle"])
                continue
            if rtype == "last-prompt":
                if rec.get("lastPrompt"):
                    last_prompt = str(rec["lastPrompt"])
                continue

            msg = rec.get("message")
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")

            if rtype == "user":
                text = extract_claude_user_text(content)
                if text:
                    turns.append(
                        {
                            "role": "user",
                            "text": text,
                            "timestamp": str(rec.get("timestamp") or ""),
                        }
                    )
            elif rtype == "assistant":
                texts: list[str] = []
                if isinstance(content, str):
                    if content.strip():
                        texts.append(content.strip())
                elif isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")
                        if btype == "text":
                            t = (block.get("text") or "").strip()
                            if t:
                                texts.append(t)
                        elif btype == "tool_use":
                            tname = str(block.get("name") or "")
                            tinput = block.get("input")
                            if isinstance(tinput, dict):
                                if "update_plan" in tname or "TodoWrite" in tname:
                                    plan_items = apply_claude_plan_tool(
                                        plan_items, tname, tinput
                                    )
                                if tname in ("Edit", "Write", "MultiEdit"):
                                    fpath = tinput.get("file_path")
                                    if isinstance(fpath, str) and fpath not in modified_seen:
                                        modified_seen.add(fpath)
                                        modified_files.append(fpath)

                combined = "\n\n".join(texts).strip()
                if combined:
                    if turns and turns[-1]["role"] == "assistant":
                        turns[-1]["text"] = f"{turns[-1]['text']}\n\n{combined}".strip()
                        if rec.get("timestamp"):
                            turns[-1]["timestamp"] = str(rec["timestamp"])
                    else:
                        turns.append(
                            {
                                "role": "assistant",
                                "text": combined,
                                "timestamp": str(rec.get("timestamp") or ""),
                            }
                        )

    return {
        "source": "claude",
        "session_id": session_id,
        "path": path,
        "title": custom_title,
        "last_prompt": last_prompt,
        "cwd": cwd,
        "git_branch": git_branch,
        "plan_items": plan_items,
        "modified_files": modified_files,
        "turns": turns,
    }


def parse_codex_session(path: str) -> dict[str, Any]:
    """Parse a Codex rollout .jsonl file."""
    session_id = Path(path).stem
    cwd: str | None = None
    git_branch: str | None = None
    plan_items: list[dict[str, str]] = []
    modified_files: list[str] = []
    turns: list[dict[str, str]] = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            rtype = rec.get("type")
            payload = rec.get("payload")
            if not isinstance(payload, dict):
                continue

            if rtype == "session_meta":
                session_id = payload.get("session_id") or payload.get("id") or session_id
                cwd = payload.get("cwd") or cwd
                git_info = payload.get("git")
                if isinstance(git_info, dict) and git_info.get("branch"):
                    git_branch = git_info.get("branch")
                continue

            if rtype == "turn_context":
                cwd = payload.get("cwd") or cwd
                continue

            if rtype != "response_item":
                continue

            ptype = payload.get("type")
            if ptype == "function_call" and payload.get("name") == "update_plan":
                args_raw = payload.get("arguments")
                if isinstance(args_raw, str):
                    try:
                        args_obj = json.loads(args_raw)
                        plan = args_obj.get("plan")
                        if isinstance(plan, list):
                            plan_items = [
                                {
                                    "content": str(item.get("step", "")),
                                    "status": str(item.get("status", "pending")),
                                }
                                for item in plan
                                if isinstance(item, dict)
                            ]
                    except json.JSONDecodeError:
                        pass
                continue

            if ptype != "message":
                continue

            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue

            content = payload.get("content")
            parts: list[str] = []
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if role == "user" and btype in ("input_text", "text"):
                        txt = (block.get("text") or "").strip()
                        if not txt:
                            continue
                        if any(txt.startswith(p) for p in CODEX_USER_SKIP_PREFIXES):
                            continue
                        parts.append(txt)
                    elif role == "assistant" and btype in ("output_text", "text"):
                        txt = (block.get("text") or "").strip()
                        if txt:
                            parts.append(txt)

            combined = "\n\n".join(parts).strip()
            if not combined:
                continue

            if role == "assistant" and turns and turns[-1]["role"] == "assistant":
                turns[-1]["text"] = f"{turns[-1]['text']}\n\n{combined}".strip()
                if rec.get("timestamp"):
                    turns[-1]["timestamp"] = str(rec["timestamp"])
            else:
                turns.append(
                    {
                        "role": role,
                        "text": combined,
                        "timestamp": str(rec.get("timestamp") or ""),
                    }
                )

    return {
        "source": "codex",
        "session_id": session_id,
        "path": path,
        "title": None,
        "last_prompt": None,
        "cwd": cwd,
        "git_branch": git_branch,
        "plan_items": plan_items,
        "modified_files": modified_files,
        "turns": turns,
    }


def get_git_info(target_cwd: str | None) -> tuple[str, str]:
    """Return (git status --short --branch, git log -n 3 --oneline) for target_cwd."""
    if not target_cwd or not os.path.isdir(target_cwd):
        return "", ""
    status_out = ""
    log_out = ""
    try:
        res_st = subprocess.run(
            ["git", "-C", target_cwd, "status", "--short", "--branch"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res_st.returncode == 0:
            status_out = res_st.stdout.strip()
        res_lg = subprocess.run(
            ["git", "-C", target_cwd, "log", "-n", "3", "--oneline"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res_lg.returncode == 0:
            log_out = res_lg.stdout.strip()
    except Exception:
        pass
    return status_out, log_out


def truncate_text(text: str, limit: int) -> str:
    """Truncate long text while preserving the tail if extremely long or noting truncation."""
    if limit <= 0 or len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}\n\n... [truncated {len(text) - limit} chars]"


def render_session_list(sessions: list[dict[str, Any]], cwd: str) -> str:
    """Render discovered sessions as a markdown list."""
    lines = [
        f"# Matched Sessions for `{cwd}`",
        "",
        f"Total matched: {len(sessions)}",
        "",
        "| # | Source | Last Updated | Size | Session ID | Path |",
        "|---:|---|---|---:|---|---|",
    ]
    for idx, s in enumerate(sessions, start=1):
        lines.append(
            f"| {idx} | `{s['source']}` | {format_mtime(s['mtime'])} | "
            f"{format_size(s['size'])} | `{s['session_id']}` | `{s['path']}` |"
        )
    return "\n".join(lines)


def render_context_markdown(
    parsed: dict[str, Any],
    mtime: float,
    turns_limit: int,
    max_chars: int,
) -> str:
    """Render parsed session context in clean Markdown."""
    session_cwd = parsed.get("cwd")
    status_out, log_out = get_git_info(session_cwd)

    lines = [
        "# Handoff Context Summary",
        "",
        "## Session Metadata",
        f"- **Source**: `{parsed['source']}`",
        f"- **Session ID**: `{parsed['session_id']}`",
        f"- **Session File**: `{parsed['path']}`",
    ]
    if parsed.get("title"):
        lines.append(f"- **Title**: {parsed['title']}")
    if session_cwd:
        lines.append(f"- **Working Directory**: `{session_cwd}`")
    if parsed.get("git_branch"):
        lines.append(f"- **Git Branch**: `{parsed['git_branch']}`")
    lines.append(f"- **Last Updated**: {format_mtime(mtime)}")
    lines.append("")

    if status_out or log_out:
        lines.append("## Git & Worktree Status")
        if status_out:
            lines.extend(["```text", status_out, "```"])
        if log_out:
            lines.extend(["**Recent Commits:**", "```text", log_out, "```"])
        lines.append("")

    plan_items = parsed.get("plan_items") or []
    if plan_items:
        lines.append("## Latest Plan / Checklist")
        for item in plan_items:
            status = item.get("status", "pending")
            if status == "completed":
                box = "[x]"
            elif status == "in_progress":
                box = "[/]"
            else:
                box = "[ ]"
            lines.append(f"- {box} {item.get('content', '')} (`{status}`)")
        lines.append("")

    modified_files = parsed.get("modified_files") or []
    if modified_files:
        lines.append("## Recently Modified Files in Session (Last 20)")
        for fpath in modified_files[-20:]:
            lines.append(f"- `{fpath}`")
        lines.append("")

    all_turns = parsed.get("turns") or []
    recent_turns = all_turns[-turns_limit:] if turns_limit > 0 else all_turns

    last_assistant_idx = -1
    for i, t in enumerate(recent_turns):
        if t.get("role") == "assistant":
            last_assistant_idx = i

    lines.append(
        f"## Recent Conversation Turns (showing {len(recent_turns)} of {len(all_turns)})"
    )
    lines.append("")

    for i, turn in enumerate(recent_turns):
        role_label = "User" if turn["role"] == "user" else "Assistant"
        ts = turn.get("timestamp")
        header = f"### {role_label}"
        if ts:
            header += f" ({ts})"
        lines.append(header)
        limit = max(max_chars, 4000) if i == last_assistant_idx else max_chars
        lines.append(truncate_text(turn.get("text", ""), limit))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract Claude Code / Codex session context for Antigravity handoff."
    )
    parser.add_argument(
        "--cwd",
        default=os.getcwd(),
        help="Base workspace directory (default: current working directory)",
    )
    parser.add_argument(
        "--source",
        choices=["all", "claude", "codex"],
        default="all",
        help="Session source to search (default: all)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List matched sessions sorted by mtime without printing conversation turns",
    )
    parser.add_argument(
        "--session",
        default=None,
        help="Session ID substring or exact .jsonl path",
    )
    parser.add_argument(
        "--turns",
        type=int,
        default=6,
        help="Number of recent user/assistant turns to display (default: 6)",
    )
    parser.add_argument(
        "--max-chars",
        type=int,
        default=2000,
        help="Max characters per message body (default: 2000, 4000 for final assistant reply)",
    )
    args = parser.parse_args()

    # Handle direct .jsonl path passed to --session
    if args.session and args.session.endswith(".jsonl") and os.path.isfile(args.session):
        sel_path = os.path.abspath(args.session)
        mtime = os.path.getmtime(sel_path)
        source = "codex" if str(CODEX_SESSIONS_DIR) in sel_path else "claude"
        if args.source != "all":
            source = args.source
        parsed = (
            parse_codex_session(sel_path)
            if source == "codex"
            else parse_claude_session(sel_path)
        )
        print(render_context_markdown(parsed, mtime, args.turns, args.max_chars))
        return 0

    targets = get_target_paths(args.cwd)
    sessions: list[dict[str, Any]] = []
    if args.source in ("all", "claude"):
        sessions.extend(discover_claude_sessions(targets))
    if args.source in ("all", "codex"):
        sessions.extend(discover_codex_sessions(targets))

    sessions.sort(key=lambda s: s["mtime"], reverse=True)

    if args.session:
        needle = args.session.lower()
        sessions = [
            s
            for s in sessions
            if needle in s["session_id"].lower() or needle in s["path"].lower()
        ]

    if not sessions:
        print(
            f"No matching {args.source} sessions found for `{args.cwd}`.",
            file=sys.stderr,
        )
        return 1

    if args.list:
        print(render_session_list(sessions, args.cwd))
        return 0

    chosen = sessions[0]
    if chosen["source"] == "codex":
        parsed = parse_codex_session(chosen["path"])
    else:
        parsed = parse_claude_session(chosen["path"])

    print(render_context_markdown(parsed, chosen["mtime"], args.turns, args.max_chars))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
