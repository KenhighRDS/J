#!/usr/bin/env bash
# Claude Code cloud environment "Setup script" (claude.ai/code -> environment -> Setup script).
# Paste this file's contents there. It runs once per environment and is cached, so
# every cloud session starts with the toolchain already on disk. Keep it under ~5 min
# and always exit 0 (a non-zero exit blocks sessions from starting).
set +e
export PATH="$HOME/.local/bin:/opt/node24/bin:$PATH"
npm install -g @ast-grep/cli lefthook @fission-ai/openspec@latest @beads/bd ccusage >/dev/null 2>&1 &
uv tool install semgrep >/dev/null 2>&1 &
uv tool install -p 3.13 serena-agent >/dev/null 2>&1 &
( V=8.30.1; t=$(mktemp -d); b="https://github.com/gitleaks/gitleaks/releases/download/v$V"
  curl -fsSL -o "$t/g.tgz" "$b/gitleaks_${V}_linux_x64.tar.gz" && curl -fsSL -o "$t/s.txt" "$b/gitleaks_${V}_checksums.txt" \
  && [ "$(grep linux_x64.tar.gz "$t/s.txt" | awk '{print $1}')" = "$(sha256sum "$t/g.tgz" | awk '{print $1}')" ] \
  && mkdir -p "$HOME/.local/bin" && tar -xzf "$t/g.tgz" -C "$t" gitleaks && install -m755 "$t/gitleaks" "$HOME/.local/bin/gitleaks" ) >/dev/null 2>&1 &
( [ -x /opt/node24/bin/npm ] && PATH="/opt/node24/bin:$PATH" npm install -g --allow-scripts=context-mode,better-sqlite3 context-mode ) >/dev/null 2>&1 &
npx -y @playwright/mcp@latest --version >/dev/null 2>&1 &   # warm the npx cache
wait
serena init >/dev/null 2>&1 || true
# Optional (plugins only load in cloud sessions when installed before launch):
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true
claude plugin install superpowers@claude-plugins-official >/dev/null 2>&1 || true
exit 0
