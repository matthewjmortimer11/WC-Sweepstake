#!/usr/bin/env bash
# Launches the official Postgres MCP server with a connection URL from the env.
# Use a read-only dev/staging URL — never point this at production write access.
set -euo pipefail
URL="${WHEESHT_POSTGRES_MCP_URL:?Set WHEESHT_POSTGRES_MCP_URL (postgresql://… read-only dev URL)}"
exec npx -y @modelcontextprotocol/server-postgres "$URL"
