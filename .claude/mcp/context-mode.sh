#!/usr/bin/env bash
# Launches the context-mode MCP server on stdio. Requires Node >= 24.15.
# Order: `context-mode` on PATH under a new-enough node -> the cloud container's
# Node 24 install -> give up (the server just shows as disconnected).
set -u
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>24||(a===24&&b>=15)?0:1)' 2>/dev/null; }
if command -v context-mode >/dev/null 2>&1 && node_ok node; then
  exec context-mode server --agent claude-code
fi
if [ -x /opt/node24/bin/node ] && [ -f /opt/node24/lib/node_modules/context-mode/cli.mjs ]; then
  exec /opt/node24/bin/node /opt/node24/lib/node_modules/context-mode/cli.mjs server --agent claude-code
fi
echo "context-mode unavailable: needs Node >= 24.15 and 'npm i -g context-mode' (scripts/bootstrap.sh)" >&2
exit 1
