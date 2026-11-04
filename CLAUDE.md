# J — Claude Code project guide

Loaded every session. Keep this file short; the full tool reference is `docs/TOOLING.md` (read it only when you need details).

## Project
- New repository. Application code has not started; stack is **TBD** and must be decided through an OpenSpec proposal (`/opsx:propose`) before scaffolding.
- Cloud sessions also expose Netlify, Shopify, Supabase and GitHub MCP servers. Use them for platform work instead of guessing.

## Working rules
1. **Minimize tokens without losing quality.** Read only what you need (line ranges, grep, Serena symbol tools, `ctx_search`). Never cat whole large files or dump big outputs; route long command output, logs, JSON and web pages through context-mode (`ctx_execute`, `ctx_batch`). Delegate broad searches to an Explore subagent and keep only conclusions.
2. **Understand, then plan, then build.** For any non-trivial change: inspect the relevant code, run `/opsx:propose <change>` (proposal, specs, design, tasks), wait for approval, then `/opsx:apply`. Track the work as beads issues (`bd create`, `bd update <id> --claim`, `bd close <id>`).
3. **Surgical edits.** Prefer targeted edits (Edit tool, Serena `replace_symbol_body`, `ast-grep --rewrite`) over rewriting files. Preserve existing features and working code; do not refactor what you were not asked to change.
4. **Fix root causes.** Reproduce, locate the cause (superpowers `systematic-debugging`), fix it there, add a regression test. No temporary patches or silenced errors.
5. **Verify before pushing.** Run lint, typecheck, tests and build for what you changed; lefthook enforces gitleaks + ast-grep + lint on commit and semgrep + typecheck/test/build on push. Review the diff (`/code-review`; `/security-review` for auth, input handling, secrets, payments; `/simplify` for cleanup). Never push failing or unverified code.
6. **Permission boundaries.** Never deploy, publish, or push to any branch other than the assigned one without explicit permission. Never bypass hooks (`LEFTHOOK=0`, `--no-verify`) silently.
7. **Current documentation.** For any library, framework, API, setup or config question use context7 (`resolve-library-id` then `get-library-docs`) rather than memory; versions and APIs drift.
8. **Design system.** Follow the project's existing design system and conventions unless a redesign is explicitly requested.
9. **Continuity.** Write durable knowledge where the next session finds it: `bd remember "<fact>"`, Serena memories (`write_memory`), OpenSpec specs. Before ending: close/update beads issues, file follow-ups as new issues, leave `git status` clean or explained.

## UI work (mandatory)
- Before building or changing any interface, load the `frontend-design` skill (`.claude/skills/frontend-design`, the official Anthropic skill) and follow it.
- Bar: modern, minimalist, polished, professional. Excellent typography and spacing, purposeful motion, responsive from 360px to wide screens, accessible (contrast, focus, keyboard, reduced motion). Nothing that reads as a generic AI template.
- Never call UI done without rendering it: use the Playwright MCP server (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`) at phone, tablet and desktop widths, look at the result, and fix what is off.

## Tool playbook
| Need | Use |
|---|---|
| Library / API docs | `context7` MCP |
| Navigate or edit code by symbol, find references, rename | `serena` MCP (prefer over grep + read for code) |
| Structural search, rewrite, custom lint | `ast-grep run -p '<pattern>' -l ts [--rewrite]`; project rules in `.ast-grep/rules` |
| Long output, logs, JSON, URLs, big files | `context-mode`: `ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume` after compaction |
| Browser checks, screenshots, e2e | `playwright` MCP (headless) |
| Specs and change workflow | OpenSpec: `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive` (`/opsx:sync`, `/opsx:update`) |
| Tasks, memory, handoffs | beads: `bd ready`, `bd show`, `bd create`, `bd close`, `bd remember`, `bd prime` |
| Method: brainstorm, plan, TDD, debug, review | superpowers skills (available in local sessions; see Cloud vs local) |
| Secrets and SAST on demand | `gitleaks dir .`, `semgrep scan --config p/default --metrics=off` |
| Token and cost reporting | `ccusage daily`, `ccusage session`, `ccusage blocks`; the status line shows live cost |

Note: context-mode hook messages name its tools as `mcp__plugin_context-mode_context-mode__ctx_*`; in this repo the server is project-scoped, so call `mcp__context-mode__ctx_*` instead.

Automatic behaviors: `scripts/bootstrap.sh` runs at session start and installs anything missing; `bd prime` injects open work; context-mode hooks block oversized reads and point to the `ctx_*` call to use; Serena reminder hooks nudge symbol tools; lefthook runs the git gates above.

## Git
- Work only on the assigned branch. Small commits with clear messages. Do not create pull requests unless asked.
- Commit-time gates fail closed on secrets (gitleaks). Fix the cause; do not allowlist real secrets.

## Cloud vs local sessions
- Cloud sessions load: this file, `.claude/` (settings, hooks, skills, commands), `.mcp.json`, `.serena/`, `openspec/`, `.beads/`. They do not load marketplace plugins (superpowers, claude-mem) unless the environment setup script (`scripts/cloud-setup.sh`) installed them or they are enabled on claude.ai.
- Local sessions get everything, including superpowers (`enabledPlugins`) and claude-mem (installed by `scripts/bootstrap.sh`).
- The beads database is restored by `bd bootstrap` on fresh clones (from `refs/dolt/data` after a `bd dolt push`, otherwise from the committed `.beads/issues.jsonl` export).

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
