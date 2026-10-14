#!/usr/bin/env python3
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request


def write_atomically(path, contents):
    descriptor, temporary_path = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(contents)
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def read_subtree_split(dotfiles_git_dir, subtree_prefix):
    # The vendored checkout has no .git of its own; the upstream revision lives in
    # the trailer of the latest "git subtree ... --squash" commit for this prefix.
    squash_message = subprocess.run(
        ["git", f"--git-dir={dotfiles_git_dir}", "log", "-1", "--format=%B", "--fixed-strings",
         f"--grep=git-subtree-dir: {subtree_prefix}"],
        check=True, capture_output=True, text=True, timeout=5,
    ).stdout
    trailers = dict(re.findall(r"^(git-subtree-dir|git-subtree-split): (\S+)$", squash_message, re.MULTILINE))
    if trailers.get("git-subtree-dir") != subtree_prefix:
        raise ValueError("No squash commit found for the subtree prefix")
    if not re.fullmatch(r"[0-9a-f]{40}", trailers.get("git-subtree-split", "")):
        raise ValueError("Invalid git-subtree-split trailer")
    return trailers["git-subtree-split"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dotfiles-git-dir", type=Path, default=Path.home() / ".dotfiles")
    parser.add_argument("--subtree-prefix", default=".local/share/agent-skills/im-not-ai")
    parser.add_argument("--cache-dir", type=Path, default=Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "humanize-korean")
    parser.add_argument("--remote-url", default="https://api.github.com/repos/epoko77-ai/im-not-ai/commits/main")
    arguments = parser.parse_args()
    arguments.cache_dir.mkdir(parents=True, exist_ok=True)
    status = {"checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    notice = ""
    try:
        installed_revision = read_subtree_split(arguments.dotfiles_git_dir, arguments.subtree_prefix)
        status["installed_revision"] = installed_revision
        request = urllib.request.Request(arguments.remote_url, headers={"User-Agent": "dotfiles-humanize-korean", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(request, timeout=5) as response:
            latest_revision = json.load(response)["sha"]
        if not isinstance(latest_revision, str) or not re.fullmatch(r"[0-9a-f]{40}", latest_revision):
            raise ValueError("Invalid upstream revision")
        status["latest_revision"] = latest_revision
        status["state"] = "up_to_date" if installed_revision == latest_revision else "update_available"
        if status["state"] == "update_available":
            notice = f"humanize-korean: 업데이트 있음 / 설치 {installed_revision[:7]} → 원격 {latest_revision[:7]}. 업데이트하려면 humanize-update 를 실행하세요.\n"
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        status["state"] = "unavailable"
        notice = "humanize-korean: 버전 확인 실패. 설치된 버전은 그대로 사용합니다.\n"
    write_atomically(arguments.cache_dir / "status.json", json.dumps(status, indent=2) + "\n")
    write_atomically(arguments.cache_dir / "notice.txt", notice)
    return 0 if status["state"] != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
