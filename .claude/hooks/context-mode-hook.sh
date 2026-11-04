#!/usr/bin/env bash
# context-mode hook (PreToolUse/PostToolUse/SessionStart/UserPromptSubmit).
# Reads the hook JSON on stdin and answers on stdout. No-op if unavailable.
set -u
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>24||(a===24&&b>=15)?0:1)' 2>/dev/null; }
if command -v context-mode >/dev/null 2>&1 && node_ok node; then
  exec context-mode hook --agent claude-code
fi
if [ -x /opt/node24/bin/node ] && [ -f /opt/node24/lib/node_modules/context-mode/cli.mjs ]; then
  exec /opt/node24/bin/node /opt/node24/lib/node_modules/context-mode/cli.mjs hook --agent claude-code
fi
exit 0
