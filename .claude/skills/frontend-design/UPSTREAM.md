Vendored copy of Anthropic's official `frontend-design` plugin skill (v1.1.1).

Source: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design
Why vendored: cloud sessions do not load marketplace plugins, and `.claude/skills/`
is loaded everywhere. Refresh with `scripts/sync-frontend-design-skill.sh`.
