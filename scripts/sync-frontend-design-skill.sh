#!/usr/bin/env bash
# Refresh the vendored copy of Anthropic's official frontend-design skill.
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/plugins/frontend-design"
curl -fsSL "$BASE/skills/frontend-design/SKILL.md"    -o "$ROOT/.claude/skills/frontend-design/SKILL.md"
curl -fsSL "$BASE/skills/frontend-design/LICENSE.txt" -o "$ROOT/.claude/skills/frontend-design/LICENSE.txt"
ver="$(curl -fsSL "$BASE/.claude-plugin/plugin.json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
sed -i.bak "s/plugin skill (v[0-9.]*)/plugin skill (v${ver})/" "$ROOT/.claude/skills/frontend-design/UPSTREAM.md" && rm -f "$ROOT/.claude/skills/frontend-design/UPSTREAM.md.bak"
echo "frontend-design skill synced (upstream v${ver})"
