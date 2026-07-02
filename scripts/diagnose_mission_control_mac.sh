#!/usr/bin/env bash
# Diagnose and attempt repair of Mission Control on macOS. Paste full output to cloud agent.
set -u
LOG_DIR="${TMPDIR:-/tmp}/quota-tracker-bridge"
mkdir -p "$LOG_DIR"
REPORT="$LOG_DIR/diagnostic-report.txt"

log() { echo "$@" | tee -a "$REPORT"; }

: >"$REPORT"
log "=== Mission Control diagnostic $(date) ==="
log "Host: $(hostname)"
log "User: $(whoami)"
log ""

log "--- Port 8765 (dashboard) ---"
if lsof -nP -iTCP:8765 -sTCP:LISTEN 2>/dev/null; then
  log "Listener found on 8765"
else
  log "Nothing listening on 8765"
fi
HTTP8765="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:8765/" 2>/dev/null || echo err)"
log "curl http://127.0.0.1:8765/ -> $HTTP8765"
log ""

log "--- Port 9876 (bridge) ---"
if lsof -nP -iTCP:9876 -sTCP:LISTEN 2>/dev/null; then
  log "Listener found on 9876"
else
  log "Nothing listening on 9876"
fi
log "curl http://127.0.0.1:9876/ ->"
curl -s --max-time 3 "http://127.0.0.1:9876/" 2>/dev/null | tee -a "$REPORT" || log "(no response)"
log ""
log ""

log "--- cloudflared ---"
pgrep -fl cloudflared 2>/dev/null | tee -a "$REPORT" || log "cloudflared not running"
TUNNEL_URL="$(grep -rEo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_DIR" "$HOME/Library/Logs" /tmp 2>/dev/null | tail -1 | cut -d: -f2- || true)"
log "Tunnel URL (if found): ${TUNNEL_URL:-none}"
log ""

log "--- Find dashboard ---"
DASH=""
if [[ -n "${QUOTA_DASHBOARD_DIR:-}" && -f "$QUOTA_DASHBOARD_DIR/local_app.py" ]]; then
  DASH="$QUOTA_DASHBOARD_DIR"
fi
if [[ -z "$DASH" ]]; then
  DASH="$(find "$HOME/Documents/Codex" -name local_app.py 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)"
fi
if [[ -z "$DASH" ]]; then
  DASH="$(find "$HOME" -maxdepth 6 -name local_app.py 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)"
fi
log "Dashboard dir: ${DASH:-NOT FOUND}"
if [[ -n "$DASH" && -d "$DASH" ]]; then
  log "Files:"
  ls -la "$DASH" 2>/dev/null | head -20 | tee -a "$REPORT"
  log ""
  if [[ -f "$DASH/requirements.txt" ]]; then
    log "requirements.txt present"
  fi
fi
log ""

if [[ -z "$DASH" ]]; then
  log "STOP: Cannot find ai-quota-dashboard. Set QUOTA_DASHBOARD_DIR=/path/to/ai-quota-dashboard"
  log "=== END REPORT ==="
  cat "$REPORT"
  exit 1
fi

log "--- Attempt start dashboard (15s test) ---"
lsof -ti :8765 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

STARTED=0
WINNING_ENTRY=""
for entry in local_app.py server.py; do
  if [[ ! -f "$DASH/$entry" ]]; then
    log "Skip missing $entry"
    continue
  fi
  log "Trying: python3 $DASH/$entry"
  python3 "$DASH/$entry" >"$LOG_DIR/start-test.log" 2>&1 &
  SPID=$!
  for _ in $(seq 1 20); do
    CODE="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://127.0.0.1:8765/" 2>/dev/null || echo 000)"
    if [[ "$CODE" != "000" && "$CODE" != "err" ]]; then
      log "SUCCESS with $entry -> HTTP $CODE"
      STARTED=1
      WINNING_ENTRY="$entry"
      break 2
    fi
    sleep 0.5
  done
  kill "$SPID" 2>/dev/null || true
  wait "$SPID" 2>/dev/null || true
  log "Failed $entry. Log tail:"
  tail -30 "$LOG_DIR/start-test.log" | tee -a "$REPORT"
  log ""
done

if [[ "$STARTED" -eq 0 ]]; then
  log "REPAIR FAILED: dashboard would not start. Full log:"
  cat "$LOG_DIR/start-test.log" | tee -a "$REPORT"
  log ""
  log "Try manually: cd \"$DASH\" && python3 local_app.py"
  log "If ImportError: pip3 install -r requirements.txt"
  log "=== END REPORT ==="
  cat "$REPORT"
  exit 1
fi

log "--- Keep dashboard running in background ---"
nohup python3 "$DASH/${entry:-local_app.py}" >"$LOG_DIR/dashboard.log" 2>&1 &
echo $! >"$LOG_DIR/dashboard.pid"
sleep 2
log "Dashboard pid $(cat "$LOG_DIR/dashboard.pid")"
log ""

log "--- Start forwarder if needed ---"
FORWARDER="$DASH/scripts/quota_forwarder.py"
[[ -f "$FORWARDER" ]] || FORWARDER=""
if [[ -z "$FORWARDER" ]]; then
  log "quota_forwarder.py not found in Codex app"
else
  if ! lsof -nP -iTCP:9876 -sTCP:LISTEN >/dev/null 2>&1; then
    nohup python3 "$FORWARDER" >"$LOG_DIR/forwarder.log" 2>&1 &
    echo $! >"$LOG_DIR/forwarder.pid"
    sleep 1
  fi
  log "Forwarder log tail:"
  tail -5 "$LOG_DIR/forwarder.log" 2>/dev/null | tee -a "$REPORT" || true
fi
log ""

log "--- Test tracker POST ---"
curl -s -X POST "http://127.0.0.1:8765/api/trackers/cursor-workspace" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cursor Cloud Agent","vendor":"Cursor","status":"live","available_count":1,"summary":"Diagnostic repair test","metrics":[{"label":"Phase","value":"testing"}]}' \
  | tee -a "$REPORT"
log ""
log ""

log "--- Next: start tunnel (run separately) ---"
CF="$DASH/bin/cloudflared"
[[ -x "$CF" ]] || CF="$(command -v cloudflared 2>/dev/null || true)"
if [[ -n "$CF" ]]; then
  log "Run: \"$CF\" tunnel --url http://127.0.0.1:9876"
  log "Copy the https://....trycloudflare.com URL into Cursor Cloud Agents secret QUOTA_TRACKER_URL"
else
  log "Install cloudflared: brew install cloudflared"
fi

log ""
log "=== END REPORT — paste everything above to cloud agent ==="
cat "$REPORT"
