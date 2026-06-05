#!/bin/zsh
set -euo pipefail

DEVICE_NAME="${1:-iPhone 17 Pro (26.5)}"
VIEWER_PLIST="$HOME/Library/LaunchAgents/com.eyedroot.serve-sim-viewer.plist"

run_serve_sim() {
  if command -v serve-sim >/dev/null 2>&1; then
    serve-sim "$@"
  else
    npx --yes serve-sim@latest "$@"
  fi
}

echo "Booting simulator: ${DEVICE_NAME}"
xcrun simctl boot "${DEVICE_NAME}" >/dev/null 2>&1 || true

echo "Starting serve-sim stream helper"
run_serve_sim --kill >/dev/null 2>&1 || true
run_serve_sim --detach "${DEVICE_NAME}" >/dev/null

echo "Ensuring local viewer LaunchAgent is loaded"
launchctl bootstrap "gui/$(id -u)" "${VIEWER_PLIST}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$(id -u)/com.eyedroot.serve-sim-viewer" >/dev/null

echo "Ensuring Tailscale TCP forwarding"
tailscale serve --bg --tcp=3200 tcp://127.0.0.1:3200 >/dev/null

TAILSCALE_IP="$(tailscale ip -4 | head -n 1)"
MAGIC_DNS="$(
  tailscale status --json |
    /usr/bin/python3 -c 'import json,sys; s=json.load(sys.stdin); print(s.get("Self", {}).get("DNSName", "").rstrip("."))'
)"

echo
echo "Remote simulator viewer is ready:"
echo "  http://${TAILSCALE_IP}:3200"
if [[ -n "${MAGIC_DNS}" ]]; then
  echo "  http://${MAGIC_DNS}:3200"
fi
