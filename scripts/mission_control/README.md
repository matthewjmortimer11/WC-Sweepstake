# Mission Control — Sites panel integration

Built in WC-Sweepstake for the Codex **ai-quota-dashboard** app.

## What this adds

- **Site registry** (`sites.json`) — all wheesht.xyz apps with paths, URLs, test files
- **`sync_sites.py`** — polls production HTTP + git recent changes → `POST /api/sync`
- **`agent_status.py`** — auto-detects which site Cursor is editing from git paths
- **UI assets** — `sites-panel.js` + `sites-panel.css` for Mission Control

## Copy into Mission Control (Codex app)

From this repo, copy to your dashboard folder:

```bash
DASH="/Users/Matt/Documents/Codex/2026-07-02/usr-bin-env-bash-set-euo/outputs/ai-quota-dashboard"
REPO="/path/to/WC-Sweepstake"

cp "$REPO/scripts/mission_control/sites-panel.js" "$DASH/public/"
cp "$REPO/scripts/mission_control/sites-panel.css" "$DASH/public/"
```

In `public/index.html` add:

```html
<link rel="stylesheet" href="/sites-panel.css" />
<div id="sites-panel"></div>
<script src="/sites-panel.js"></script>
```

## Server: accept `/api/sync` (if not already)

`POST /api/sync` body shape from `python3 scripts/sync_sites.py --dry-run`:

```json
{
  "synced_at": "ISO8601",
  "repo": "WC-Sweepstake",
  "repo_url": "https://github.com/...",
  "branch": "cursor/...",
  "main_sha": "f3e84f7",
  "links": [{ "label": "Production", "url": "https://wheesht.xyz/" }],
  "sites": [
    {
      "id": "dethrone",
      "name": "Dethrone",
      "url": "https://wheesht.xyz/dethrone",
      "path": "/dethrone",
      "http_code": 200,
      "status": "live",
      "checked_at": "..."
    }
  ],
  "recent_changes": [
    { "sha": "f3e84f7", "subject": "Merge movement fix", "when": "3 days ago", "sites": ["dethrone"] }
  ]
}
```

`GET /api/mission-control` should return the latest stored sync payload (merge with tracker state).

## Run sync (Mac, every 15 min or before work)

```bash
export QUOTA_TRACKER_URL="https://YOUR-TUNNEL.trycloudflare.com"
export QUOTA_TRACKER_TOKEN="your-token"
cd /path/to/WC-Sweepstake
python3 scripts/sync_sites.py
```

Dry run:

```bash
python3 scripts/sync_sites.py --dry-run
```

## Cursor agent

With secrets set, status pushes include auto-detected site:

```bash
python3 scripts/agent_status.py push --phase coding --summary "Working on Dethrone movement"
```

Metrics will include `Site: Dethrone`, `URL: wheesht.xyz/dethrone`.
