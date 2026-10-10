#!/usr/bin/env bash
set -euo pipefail

HUMANIZE_KOREAN_REPOSITORY="https://github.com/epoko77-ai/im-not-ai.git"
HUMANIZE_KOREAN_REVISION="2f3d943d08056b612a92e12bfb72ea94dd2acd18"
HUMANIZE_KOREAN_REPO_DIR="${HUMANIZE_KOREAN_REPO_DIR:-$HOME/.local/share/agent-skills/im-not-ai}"

if [ ! -e "$HUMANIZE_KOREAN_REPO_DIR" ]; then
    mkdir -p "$(dirname "$HUMANIZE_KOREAN_REPO_DIR")"
    git clone --no-checkout "$HUMANIZE_KOREAN_REPOSITORY" "$HUMANIZE_KOREAN_REPO_DIR"
    git -C "$HUMANIZE_KOREAN_REPO_DIR" checkout --detach "$HUMANIZE_KOREAN_REVISION"
fi

if [ "$(git -C "$HUMANIZE_KOREAN_REPO_DIR" remote get-url origin)" != "$HUMANIZE_KOREAN_REPOSITORY" ]; then
    echo "Refusing to install from a different repository: $HUMANIZE_KOREAN_REPO_DIR" >&2
    exit 1
fi
if [ "$(git -C "$HUMANIZE_KOREAN_REPO_DIR" rev-parse HEAD)" != "$HUMANIZE_KOREAN_REVISION" ] ||
   [ -n "$(git -C "$HUMANIZE_KOREAN_REPO_DIR" status --porcelain)" ]; then
    echo "Refusing to change an existing checkout; expected clean revision $HUMANIZE_KOREAN_REVISION" >&2
    exit 1
fi

bash "$HUMANIZE_KOREAN_REPO_DIR/install.sh" --no-gemini "$@"
