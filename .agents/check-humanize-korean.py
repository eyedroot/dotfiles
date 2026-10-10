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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-dir", type=Path, default=Path.home() / ".local/share/agent-skills/im-not-ai")
    parser.add_argument("--cache-dir", type=Path, default=Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "humanize-korean")
    parser.add_argument("--remote-url", default="https://api.github.com/repos/epoko77-ai/im-not-ai/commits/main")
    arguments = parser.parse_args()
    arguments.cache_dir.mkdir(parents=True, exist_ok=True)
    status = {"checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    notice = ""
    try:
        installed_revision = subprocess.run(
            ["git", "-C", str(arguments.repository_dir), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        status["installed_revision"] = installed_revision
        request = urllib.request.Request(arguments.remote_url, headers={"User-Agent": "dotfiles-humanize-korean", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(request, timeout=5) as response:
            latest_revision = json.load(response)["sha"]
        if not isinstance(latest_revision, str) or not re.fullmatch(r"[0-9a-f]{40}", latest_revision):
            raise ValueError("Invalid upstream revision")
        status["latest_revision"] = latest_revision
        status["state"] = "up_to_date" if installed_revision == latest_revision else "update_available"
        if status["state"] == "update_available":
            notice = f"humanize-korean: 업데이트 있음 / 설치 {installed_revision[:7]} → 원격 {latest_revision[:7]}. 자동 설치하지 않습니다.\n"
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
        status["state"] = "unavailable"
        notice = "humanize-korean: 버전 확인 실패. 설치된 버전은 그대로 사용합니다.\n"
    write_atomically(arguments.cache_dir / "status.json", json.dumps(status, indent=2) + "\n")
    write_atomically(arguments.cache_dir / "notice.txt", notice)
    return 0 if status["state"] != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
