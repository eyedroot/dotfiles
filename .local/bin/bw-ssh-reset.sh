#!/usr/bin/env bash
# Bitwarden SSH agent reset — used after macOS sleep/wake hang.
set -u

SOCK="${SSH_AUTH_SOCK:-$HOME/.bitwarden-ssh-agent.sock}"
APP_NAME="Bitwarden"

echo "[bw-ssh-reset] SSH_AUTH_SOCK=$SOCK"

echo "[bw-ssh-reset] quitting $APP_NAME..."
osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null

# Wait for processes to actually exit (max 5s)
for i in 1 2 3 4 5; do
    if ! pgrep -x "$APP_NAME" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Force kill if still alive
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
    echo "[bw-ssh-reset] graceful quit failed, force killing..."
    pkill -f "/Applications/$APP_NAME.app" 2>/dev/null
    sleep 1
fi

# Remove stale socket so Bitwarden recreates it cleanly
if [ -S "$SOCK" ]; then
    rm -f "$SOCK"
fi

sleep 1

echo "[bw-ssh-reset] launching $APP_NAME..."
open -a "$APP_NAME"

# Wait for socket to reappear (max 15s)
for i in $(seq 1 15); do
    if [ -S "$SOCK" ]; then
        break
    fi
    sleep 1
done

if [ ! -S "$SOCK" ]; then
    echo "[bw-ssh-reset] ERROR: socket not recreated at $SOCK"
    echo "[bw-ssh-reset] unlock Bitwarden vault manually, then re-run."
    exit 1
fi

echo "[bw-ssh-reset] socket OK. verifying with ssh-add -L..."
# Bitwarden needs vault unlocked + approval; retry up to 20s
for i in $(seq 1 20); do
    OUT=$(SSH_AUTH_SOCK="$SOCK" ssh-add -L 2>&1)
    RC=$?
    if [ $RC -eq 0 ]; then
        echo "[bw-ssh-reset] OK — keys:"
        echo "$OUT"
        exit 0
    fi
    sleep 1
done

echo "[bw-ssh-reset] WARN: ssh-add -L still failing:"
echo "$OUT"
echo "[bw-ssh-reset] unlock Bitwarden vault (Touch ID / master password) and retry."
exit 1
