#!/usr/bin/env bash
# Idempotent dev-tool bootstrap for this repo. Safe to run any time; fast when
# everything is already present. Runs automatically at Claude Code session
# start (see .claude/settings.json) and can be run by hand:  scripts/bootstrap.sh
#
# Installs (only what is missing):
#   npm  : @ast-grep/cli lefthook @fission-ai/openspec @beads/bd ccusage
#   uv   : semgrep, serena-agent            (needs uv: https://docs.astral.sh/uv/)
#   bin  : gitleaks (checksum-verified GitHub release)
#   node : context-mode (needs Node >= 24.15; uses /opt/node24 in cloud containers)
#   local: claude-mem plugin, superpowers plugin (interactive machines only)
# Then wires: lefthook git hooks, serena global config, beads database.
#
# Opt out entirely:  J_SKIP_BOOTSTRAP=1
# Flags: --quiet (only print when something changes)  --global-only (skip repo wiring)
set -u
[ "${J_SKIP_BOOTSTRAP:-}" = "1" ] && exit 0
QUIET=0; GLOBAL_ONLY=0
for a in "$@"; do case "$a" in --quiet) QUIET=1;; --global-only) GLOBAL_ONLY=1;; esac; done
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANGED=0
log()  { echo "[bootstrap] $*"; }
note() { CHANGED=1; log "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
is_cloud() { [ -n "${CLAUDE_CODE_REMOTE_SDK_URL:-}" ] || [ -d /root/.ccr ]; }
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.1}"

# --- npm CLIs -------------------------------------------------------------
missing=()
for pair in "ast-grep:@ast-grep/cli" "lefthook:lefthook" "openspec:@fission-ai/openspec@latest" "bd:@beads/bd" "ccusage:ccusage"; do
  have "${pair%%:*}" || missing+=("${pair#*:}")
done
if [ ${#missing[@]} -gt 0 ]; then
  if have npm; then
    npm install -g "${missing[@]}" >/dev/null 2>&1 && note "installed ${missing[*]}" || log "WARN npm install failed for: ${missing[*]}"
  else log "WARN npm not found; cannot install ${missing[*]}"; fi
fi

# --- python CLIs via uv ----------------------------------------------------
if have uv; then
  have semgrep || { uv tool install semgrep >/dev/null 2>&1 && note "installed semgrep" || log "WARN semgrep install failed"; }
  have serena  || { uv tool install -p 3.13 serena-agent >/dev/null 2>&1 && note "installed serena" || log "WARN serena install failed"; }
else
  log "WARN uv not found; skipping semgrep + serena (install uv: https://docs.astral.sh/uv/)"
fi

# --- gitleaks release binary ----------------------------------------------
if ! have gitleaks; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"; arch="$(uname -m)"
  case "$arch" in x86_64|amd64) arch=x64;; aarch64|arm64) arch=arm64;; esac
  tmp="$(mktemp -d)"; base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
  if curl -fsSL --max-time 120 -o "$tmp/g.tgz" "$base/gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz" \
     && curl -fsSL --max-time 60 -o "$tmp/sums.txt" "$base/gitleaks_${GITLEAKS_VERSION}_checksums.txt"; then
    exp="$(grep "_${os}_${arch}.tar.gz" "$tmp/sums.txt" | awk '{print $1}')"
    act="$(sha256sum "$tmp/g.tgz" 2>/dev/null || shasum -a 256 "$tmp/g.tgz")"; act="${act%% *}"
    if [ -n "$exp" ] && [ "$exp" = "$act" ]; then
      mkdir -p "$HOME/.local/bin" && tar -xzf "$tmp/g.tgz" -C "$tmp" gitleaks && install -m755 "$tmp/gitleaks" "$HOME/.local/bin/gitleaks" && note "installed gitleaks v$GITLEAKS_VERSION"
    else log "WARN gitleaks checksum mismatch; not installed"; fi
  else log "WARN gitleaks download failed"; fi
  rm -rf "$tmp"
fi

# --- context-mode (Node >= 24.15) -----------------------------------------
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>24||(a===24&&b>=15)?0:1)' 2>/dev/null; }
if ! { have context-mode && node_ok node; } && [ ! -f /opt/node24/lib/node_modules/context-mode/cli.mjs ]; then
  if [ -x /opt/node24/bin/npm ] && node_ok /opt/node24/bin/node; then
    PATH="/opt/node24/bin:$PATH" npm install -g --allow-scripts=context-mode,better-sqlite3 context-mode >/dev/null 2>&1 \
      && note "installed context-mode (Node 24)" || log "WARN context-mode install failed"
  elif have npm && node_ok node; then
    npm install -g context-mode >/dev/null 2>&1 && note "installed context-mode" || log "WARN context-mode install failed"
  else
    log "WARN context-mode skipped: needs Node >= 24.15 (current: $(node --version 2>/dev/null || echo none))"
  fi
fi

# --- interactive-machine extras (plugins live in ~/.claude; cloud VMs are ephemeral) ---
if ! is_cloud && [ -z "${CI:-}" ]; then
  if have claude; then
    claude plugin list 2>/dev/null | grep -q 'superpowers@claude-plugins-official' \
      || { claude plugin install superpowers@claude-plugins-official --scope project >/dev/null 2>&1 && note "installed superpowers plugin"; }
  fi
  if ! have claude-mem && have npx; then
    npx -y claude-mem install --provider claude >/dev/null 2>&1 && note "installed claude-mem (local memory)" || log "WARN claude-mem install failed"
  fi
fi

[ "$GLOBAL_ONLY" = 1 ] && { [ "$QUIET" = 1 ] && [ "$CHANGED" = 0 ] || log "global tools ready"; exit 0; }

# --- repo wiring -------------------------------------------------------------
cd "$ROOT" || exit 0
if have lefthook && [ -f lefthook.yml ] && [ -d .git ]; then
  if [ ! -f .git/hooks/pre-commit ] || ! grep -q lefthook .git/hooks/pre-commit 2>/dev/null; then
    lefthook install -f >/dev/null 2>&1 && note "installed git hooks (lefthook)"
  fi
fi
if have serena && [ ! -f "$HOME/.serena/serena_config.yml" ]; then serena init >/dev/null 2>&1 && note "initialised serena config"; fi
if have bd && [ -d .beads ] && [ ! -d .beads/embeddeddolt ] && [ ! -d .beads/dolt ]; then
  bd bootstrap >/dev/null 2>&1 && note "restored beads database (bd bootstrap)" || log "WARN bd bootstrap failed"
fi

if [ ! -f .claude/settings.json ] && [ -f scripts/claude-settings.json ]; then
  log "NOTE: .claude/settings.json is missing, so hooks/MCP approvals/permissions are not active."
  log "      One-time setup:  cp scripts/claude-settings.json .claude/settings.json"
fi

if [ "$QUIET" = 1 ] && [ "$CHANGED" = 0 ]; then exit 0; fi
log "ready: $(for t in ast-grep lefthook openspec bd ccusage semgrep serena gitleaks; do have $t && printf '%s ' $t; done)"
exit 0
