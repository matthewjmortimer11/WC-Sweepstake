---
name: quota-tracker
description: Push live Cursor agent status to the local AI Quota Tracker dashboard via QUOTA_TRACKER_URL. Use when starting work, changing phase, running tests, opening PRs, getting blocked, or when the user asks about quota tracker / live status on their app.
---

# AI Quota Tracker bridge

Cloud agents cannot reach `http://127.0.0.1:8765` on the user's laptop. The bridge
makes updates live on their dashboard.

## One-time setup (user's machine)

1. Start the Quota Tracker app (default `http://127.0.0.1:8765`).
2. From this repo root:

```bash
chmod +x scripts/start_quota_bridge.sh
./scripts/start_quota_bridge.sh
```

3. Copy the printed `https://….trycloudflare.com` URL into **Cursor → Cloud Agents → Secrets**:
   - `QUOTA_TRACKER_URL` = tunnel URL
   - `QUOTA_TRACKER_TOKEN` = same value if you enabled token auth locally

4. Verify:

```bash
QUOTA_TRACKER_URL=https://YOUR-TUNNEL.trycloudflare.com \
  python3 scripts/agent_status.py push --phase testing --summary "Bridge test"
```

The `cursor-workspace` card should update on the dashboard.

Re-run `./scripts/start_quota_bridge.sh` after reboots (quick tunnel URL changes unless you configure a named Cloudflare tunnel).

## Agent updates

```bash
python3 scripts/agent_status.py push \
  --phase exploring \
  --summary "Scouting auth flow in main.py" \
  --status live \
  --vibe curious
```

Status values: `live`, `waiting`, `limited`, `warning`, `offline`.

Extra metrics: `--metric "PR:draft open"` (repeatable).

Dry run (no network): `python3 scripts/agent_status.py push --dry-run`

## When to push

| Moment | Example |
|--------|---------|
| Session start | `phase=exploring`, `status=live` |
| Coding | `phase=coding`, branch auto-attached |
| Tests finished | `--metric "Tests:security ✓"` |
| Blocked | `status=waiting`, `available_count=0` |
| PR ready | `--metric "PR:draft"` |
| Errors | `status=warning`, `vibe gremlins` |

## Security

- Optional `QUOTA_TRACKER_TOKEN` on forwarder + Cursor secret.
- Never include secrets, env values, or prompt text in summaries/metrics.
