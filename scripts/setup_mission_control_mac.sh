#!/usr/bin/env bash
# One-shot setup for Codex Mission Control + bridge + Cloudflare tunnel on macOS.
# Run on your Mac: bash scripts/setup_mission_control_mac.sh
set -euo pipefail

LOG_DIR="${TMPDIR:-/tmp}/quota-tracker-bridge"
mkdir -p "$LOG_DIR"

find_dashboard() {
  if [[ -n "${QUOTA_DASHBOARD_DIR:-}" && -f "$QUOTA_DASHBOARD_DIR/local_app.py" ]]; then
    echo "$QUOTA_DASHBOARD_DIR"
    return 0
  fi
  local hit
  hit="$(find "$HOME/Documents/Codex" -name local_app.py 2>/dev/null | head -1 || true)"
  if [[ -n "$hit" ]]; then
    dirname "$hit"
    return 0
  fi
  return 1
}

port_up() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

DASH="$(find_dashboard)" || {
  echo "Could not find ai-quota-dashboard. Set QUOTA_DASHBOARD_DIR and retry." >&2
  exit 1
}
echo "Using dashboard: $DASH"

if ! port_up "http://127.0.0.1:8765/"; then
  echo "Starting Mission Control on :8765..."
  nohup python3 "$DASH/local_app.py" >"$LOG_DIR/dashboard.log" 2>&1 &
  echo $! >"$LOG_DIR/dashboard.pid"
  for _ in $(seq 1 20); do
    port_up "http://127.0.0.1:8765/" && break
    sleep 0.5
  done
fi

if ! port_up "http://127.0.0.1:8765/"; then
  echo "Dashboard failed to start. See $LOG_DIR/dashboard.log" >&2
  tail -20 "$LOG_DIR/dashboard.log" >&2 || true
  exit 1
fi
echo "Dashboard OK on http://127.0.0.1:8765"

FORWARDER="$DASH/scripts/quota_forwarder.py"
if [[ ! -f "$FORWARDER" ]]; then
  FORWARDER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/quota_tracker_forwarder.py"
fi

if ! lsof -nP -iTCP:9876 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting bridge forwarder on :9876..."
  QUOTA_TRACKER_TARGET="${QUOTA_TRACKER_TARGET:-http://127.0.0.1:8765}" \
    nohup python3 "$FORWARDER" >"$LOG_DIR/forwarder.log" 2>&1 &
  echo $! >"$LOG_DIR/forwarder.pid"
  sleep 1
fi
echo "Bridge listener on :9876"

if pgrep -f "cloudflared tunnel --url http://127.0.0.1:9876" >/dev/null 2>&1; then
  pkill -f "cloudflared tunnel --url http://127.0.0.1:9876" || true
  sleep 1
fi

CF="$DASH/bin/cloudflared"
if [[ ! -x "$CF" ]]; then
  CF="$(command -v cloudflared || true)"
fi
if [[ -z "$CF" ]]; then
  echo "Install cloudflared: brew install cloudflared" >&2
  exit 1
fi

echo "Starting Cloudflare tunnel..."
nohup "$CF" tunnel --url "http://127.0.0.1:9876" >"$LOG_DIR/tunnel.log" 2>&1 &
echo $! >"$LOG_DIR/tunnel.pid"

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -1 || true)"
  [[ -n "$URL" ]] && break
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "Tunnel URL not ready. Check $LOG_DIR/tunnel.log" >&2
  exit 1
fi

echo "Testing tracker POST..."
curl -fsS -X POST "http://127.0.0.1:8765/api/trackers/cursor-workspace" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cursor Cloud Agent","vendor":"Cursor","status":"live","available_count":1,"summary":"Setup script test","metrics":[{"label":"Phase","value":"testing"}]}' >/dev/null

echo
echo "========================================"
echo "Mission Control bridge is live."
echo "Public URL: $URL"
echo
echo "Add to Cursor → Cloud Agents → Secrets:"
echo "  QUOTA_TRACKER_URL=$URL"
echo
echo "Then paste that URL in chat so the cloud agent can ping you."
echo "Logs: $LOG_DIR"
echo "========================================"
