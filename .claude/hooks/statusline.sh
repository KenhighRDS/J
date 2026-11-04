#!/usr/bin/env bash
# Status line: ccusage (cost/context/burn rate) when installed, else model + dir.
if command -v ccusage >/dev/null 2>&1; then exec ccusage statusline; fi
input="$(cat)"
model="$(printf '%s' "$input" | sed -n 's/.*"display_name":"\([^"]*\)".*/\1/p' | head -1)"
printf '%s | %s' "${model:-claude}" "$(basename "$PWD")"
