#!/usr/bin/env bash
# Launches Microsoft's Playwright MCP server (browser automation for Claude).
# Headless + isolated profile. Uses the pre-installed Chromium in Claude cloud
# containers and adds --no-sandbox when running as root (required there).
set -u
args=(-y @playwright/mcp@latest --headless --isolated)
[ "$(id -u)" = "0" ] && args+=(--no-sandbox)
[ -x /opt/pw-browsers/chromium ] && args+=(--executable-path /opt/pw-browsers/chromium)
exec npx "${args[@]}"
