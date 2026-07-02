#!/usr/bin/env bash
# Start the local quota-tracker bridge and print the public URL for Cursor secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIDGE_HOST="${QUOTA_BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${QUOTA_BRIDGE_PORT:-9876}"
TRACKER_TARGET="${QUOTA_TRACKER_TARGET:-http://127.0.0.1:8765}"
LOG_DIR="${TMPDIR:-/tmp}/quota-tracker-bridge"
FORWARDER_LOG="$LOG_DIR/forwarder.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
FORWARDER_PID_FILE="$LOG_DIR/forwarder.pid"
TUNNEL_PID_FILE="$LOG_DIR/tunnel.pid"

mkdir -p "$LOG_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

if ! curl -fsS --max-time 2 "$TRACKER_TARGET/" >/dev/null 2>&1; then
  echo "Warning: Quota Tracker does not appear to be running at $TRACKER_TARGET"
  echo "Start your dashboard app first, then re-run this script."
fi

if [[ -f "$FORWARDER_PID_FILE" ]] && kill -0 "$(cat "$FORWARDER_PID_FILE")" 2>/dev/null; then
  echo "Forwarder already running (pid $(cat "$FORWARDER_PID_FILE"))."
else
  QUOTA_BRIDGE_HOST="$BRIDGE_HOST" \
  QUOTA_BRIDGE_PORT="$BRIDGE_PORT" \
  QUOTA_TRACKER_TARGET="$TRACKER_TARGET" \
  QUOTA_TRACKER_TOKEN="${QUOTA_TRACKER_TOKEN:-}" \
    nohup python3 "$ROOT/scripts/quota_tracker_forwarder.py" >"$FORWARDER_LOG" 2>&1 &
  echo $! >"$FORWARDER_PID_FILE"
  sleep 0.5
  echo "Forwarder started on http://$BRIDGE_HOST:$BRIDGE_PORT (log: $FORWARDER_LOG)"
fi

if command -v cloudflared >/dev/null 2>&1; then
  if [[ -f "$TUNNEL_PID_FILE" ]] && kill -0 "$(cat "$TUNNEL_PID_FILE")" 2>/dev/null; then
    echo "Tunnel already running (pid $(cat "$TUNNEL_PID_FILE"))."
  else
  nohup cloudflared tunnel --url "http://$BRIDGE_HOST:$BRIDGE_PORT" >"$TUNNEL_LOG" 2>&1 &
  echo $! >"$TUNNEL_PID_FILE"
  fi

  echo "Waiting for tunnel URL..."
  for _ in $(seq 1 30); do
    URL="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
    if [[ -n "$URL" ]]; then
      break
    fi
    sleep 1
  done

  if [[ -z "${URL:-}" ]]; then
    echo "Could not read tunnel URL yet. Check $TUNNEL_LOG"
    exit 1
  fi

  echo
  echo "Bridge is live."
  echo "Public URL: $URL"
  echo
  echo "Add this to Cursor → Cloud Agents → Secrets:"
  echo "  QUOTA_TRACKER_URL=$URL"
  if [[ -n "${QUOTA_TRACKER_TOKEN:-}" ]]; then
    echo "  QUOTA_TRACKER_TOKEN=(same value you exported locally)"
  else
    echo
    echo "Optional hardening:"
    echo "  export QUOTA_TRACKER_TOKEN=\"$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
)\""
    echo "  Re-run this script, then add QUOTA_TRACKER_TOKEN to Cursor secrets too."
  fi
  echo
  echo "Test from any machine:"
  echo "  QUOTA_TRACKER_URL=$URL python3 scripts/agent_status.py push --summary \"Bridge test\" --phase testing"
  exit 0
fi

if command -v ngrok >/dev/null 2>&1; then
  echo "cloudflared not found; falling back to ngrok."
  echo "Run in another terminal:"
  echo "  ngrok http $BRIDGE_PORT"
  echo "Then set QUOTA_TRACKER_URL to the https forwarding URL."
  exit 0
fi

echo "Install cloudflared or ngrok to expose the bridge to cloud agents." >&2
echo "  macOS: brew install cloudflared" >&2
echo "  Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
exit 1
