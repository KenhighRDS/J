#!/usr/bin/env bash
# Launches Serena's MCP server for this project (LSP-backed symbol tools).
set -u
if ! command -v serena >/dev/null 2>&1; then
  echo "serena unavailable: run scripts/bootstrap.sh (uv tool install -p 3.13 serena-agent)" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec serena start-mcp-server --context claude-code --project "$ROOT" \
  --enable-web-dashboard false --enable-gui-log-window false
