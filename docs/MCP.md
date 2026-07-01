# MCP servers for Cursor

Project-level MCP config lives at [`.cursor/mcp.json`](../.cursor/mcp.json). Cursor merges it when you open this repo. Restart Cursor (or reload the window) after changing the file.

## Quick start

1. Copy [`.env.example`](../.env.example) to `.env` and fill in the keys you need.
2. Export those variables in your shell, or use a tool like [direnv](https://direnv.net/) so Cursor inherits them.
3. Install prerequisites (see below).
4. Open **Cursor Settings → Tools & MCP** and confirm each server shows a green status.

You do **not** need every server enabled at once. Cursor has a soft limit of ~40 tools across all servers — disable ones you are not using.

## Servers included

| Server | Auth | What it is for |
|--------|------|----------------|
| **github** | `GITHUB_TOKEN` PAT | Issues, PRs, CI, repo search |
| **context7** | `CONTEXT7_API_KEY` (optional) | Up-to-date library docs (FastAPI, Stripe, SQLAlchemy) |
| **postgres** | `WHEESHT_POSTGRES_MCP_URL` | Read-only SQL against dev/staging Postgres |
| **stripe** | OAuth in Cursor | Pro checkout, prices, webhooks — see [PRO.md](PRO.md) |
| **playwright** | none | Browser automation for PWA / game flows |
| **sentry** | OAuth in Cursor | Production errors and stack traces |
| **fetch** | none | Simple URL → markdown fetch |
| **firecrawl** | `FIRECRAWL_API_KEY` | Search, scrape, crawl for research |
| **railway** | `railway login` | Deploy logs, env vars, service health |
| **sequential-thinking** | none | Structured multi-step reasoning tool |
| **wheesht-dev** | none | Project tools: security tests, pytest, Stripe env check |

## Prerequisites

```bash
# Node 18+ (for npx-based servers)
node --version

# Python 3.11+ dev deps (for wheesht-dev MCP)
pip install -r requirements-dev.txt

# Playwright browsers (first time only)
npx playwright install chromium

# Fetch MCP (Python uvx)
# Install uv: https://docs.astral.sh/uv/
uvx mcp-server-fetch --help

# Railway MCP (optional)
npm i -g @railway/cli && railway login
```

Make `mcp/scripts/postgres-mcp.sh` executable:

```bash
chmod +x mcp/scripts/postgres-mcp.sh
```

## Authentication details

### GitHub

Create a [fine-grained personal access token](https://github.com/settings/tokens) scoped to this repo. Set `GITHUB_TOKEN` in your environment.

### Context7

Works without a key at low rate limits. Get a free key at [context7.com](https://context7.com) and set `CONTEXT7_API_KEY`.

### Postgres

Set `WHEESHT_POSTGRES_MCP_URL` to a **read-only** `postgresql://` URL (not `postgresql+asyncpg://`). Use a dev or staging database — never production write access.

### Stripe

The config uses the hosted server (`https://mcp.stripe.com`). Cursor will prompt for OAuth on first connect. For local/test-only use, you can switch to:

```json
"stripe": {
  "command": "npx",
  "args": ["-y", "@stripe/mcp@latest"],
  "env": {
    "STRIPE_SECRET_KEY": "${env:STRIPE_SECRET_KEY}"
  }
}
```

Use a **restricted** test key (`rk_test_…`), not your full secret key.

### Sentry

Hosted at `https://mcp.sentry.dev/mcp` — OAuth on first connect. No API key in config.

### Firecrawl

Sign up at [firecrawl.dev](https://firecrawl.dev), copy your API key to `FIRECRAWL_API_KEY`.

### Railway

Requires the Railway CLI logged in (`railway login`). The server runs `railway mcp`.

## Custom `wheesht-dev` server

Local Python MCP with project-specific tools:

- `run_security_tests` — runs `pytest tests/test_security.py`
- `run_pytest` — run tests under a path
- `check_stripe_pro_env` — reports which Stripe env vars are set (never returns values)
- `project_info` — quick repo map for agents

Test manually:

```bash
python3 mcp/wheesht_dev/server.py
# Should start and wait on stdio (no stdout spam)
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Red dot in MCP settings | Open **Output → MCP**, read the error; run the `command` from `mcp.json` in a terminal |
| `npx` not found | Install Node 18+; on macOS GUI apps may need full path to `npx` |
| Postgres fails | Check `WHEESHT_POSTGRES_MCP_URL` is `postgresql://…` and DB is reachable |
| Too many tools | Disable unused servers in Cursor MCP settings |
| OAuth servers (Stripe/Sentry) | Complete the browser auth flow, then reload Cursor |

## Security

- Do not commit `.env` or PATs into `mcp.json`.
- Postgres MCP should use read-only credentials on non-production data.
- Review [SECURITY.md](SECURITY.md) and `.cursor/rules/wheesht-security.mdc` before letting agents mutate league data.
