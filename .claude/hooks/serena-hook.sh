#!/usr/bin/env bash
# Serena reminder hooks: activate | remind | cleanup. No-op if serena is missing.
set -u
command -v serena-hooks >/dev/null 2>&1 || exit 0
exec serena-hooks "${1:?activate|remind|cleanup}" --client=claude-code
