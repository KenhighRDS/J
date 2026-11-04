# Development tooling reference

Read on demand; CLAUDE.md has the short rules. Everything below is installed by
`scripts/bootstrap.sh` (idempotent, runs at session start) and, for cloud
environments, pre-baked by `scripts/cloud-setup.sh`.

## One-time setup after cloning

```bash
cp scripts/claude-settings.json .claude/settings.json   # hooks, MCP approvals, permissions, status line
scripts/bootstrap.sh                                      # installs any missing tool, wires git hooks
```

Optional: add `CONTEXT7_API_KEY` to your environment (free key at context7.com/dashboard)
for higher Context7 rate limits. In a Claude cloud environment, paste
`scripts/cloud-setup.sh` into the environment's **Setup script** so every session
starts with the tools on disk, and enable the `superpowers` plugin on claude.ai so
it syncs into cloud sessions.

## Token optimization

### context-mode (mksglu/context-mode)
- What: sandboxed execution + local FTS5 index. Large tool output stays out of the context window; Claude gets only what it asks for. Also journals the session so `ctx_resume` restores state after compaction.
- Wiring: MCP server via `.claude/mcp/context-mode.sh` (`.mcp.json`), hooks via `.claude/hooks/context-mode-hook.sh` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse). The PreToolUse hook denies a `Read` over 16 KB, `WebFetch`, `curl`/`wget` and build commands, and names the `ctx_*` call to use instead.
- Tools: `ctx_execute` (run code or shell in the sandbox, return only what it prints), `ctx_batch` (many commands, indexed, searched), `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`. Skills: `/ctx-doctor`, `/ctx-stats`, `/ctx-upgrade`.
- Needs Node >= 24.15. Cloud containers have it at `/opt/node24`; the wrappers find it automatically.
- Naming: the hook's messages say `mcp__plugin_context-mode_context-mode__ctx_*`; in this repo the server is project-scoped, so the tools are `mcp__context-mode__ctx_*`.

### ccusage
- What: reads Claude Code's local session logs and reports tokens and cost per day, week, month, session, or 5-hour billing block.
- Use: `ccusage daily`, `ccusage session`, `ccusage blocks`, `ccusage daily --json`. The status line (`.claude/hooks/statusline.sh`) shows live session cost, context usage and burn rate in local terminals.

## Planning and project management

### OpenSpec (Fission-AI/OpenSpec)
- What: spec-driven change workflow. Each change gets `openspec/changes/<name>/{proposal.md,specs/,design.md,tasks.md}`; archived changes update `openspec/specs/`.
- Commands (installed by `openspec init --tools claude` into `.claude/commands/opsx` and `.claude/skills/openspec-*`): `/opsx:explore`, `/opsx:propose <change>`, `/opsx:apply`, `/opsx:sync`, `/opsx:update`, `/opsx:archive`. Extra workflows: `openspec config profile`.
- Rule: every non-trivial feature starts with `/opsx:propose` and ends with `/opsx:archive`.
- Update agent files after upgrading the CLI: `openspec update`.

### beads (gastownhall/beads)
- What: git-backed issue tracker with a dependency graph, built for agents. Issues live in an embedded Dolt database (`.beads/embeddeddolt`, ignored); `.beads/issues.jsonl` is a committed export refreshed on every commit (`export.auto`, staged automatically).
- Commands: `bd ready`, `bd create "title" -t task -p 1`, `bd show <id>`, `bd update <id> --claim`, `bd close <id>`, `bd remember "<fact>"` (persistent memory injected by `bd prime`), `bd prime` (workflow context; also runs as a SessionStart hook).
- Sync: `bd dolt push` publishes history to `refs/dolt/data` on origin; fresh clones run `bd bootstrap` (bootstrap.sh does this when the database is missing; it falls back to the committed JSONL).
- Git hooks: installed with `--skip-hooks`; lefthook calls `bd hooks run pre-commit` instead, so lefthook stays the single owner of `.git/hooks`.

### superpowers (obra/superpowers)
- What: a methodology as skills: brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, verification-before-completion, subagent-driven-development, requesting/receiving code review, and more. A SessionStart hook injects `using-superpowers`.
- Wiring: `enabledPlugins` in `.claude/settings.json` (`superpowers@claude-plugins-official`); `claude plugin install superpowers@claude-plugins-official --scope project` on a local machine (bootstrap does it). Cloud sessions get it only from the environment setup script or a claude.ai-enabled plugin.
- Division of labor: OpenSpec owns *what* (specs, proposals); superpowers owns *how* (TDD, debugging, review); beads owns *tracking*.

## Smart code editing and debugging

### Serena (oraios/serena)
- What: LSP-backed semantic tools: find symbols, references, insert/replace symbol bodies, rename, plus project memories in `.serena/memories/` (committed, so they survive cloud sessions).
- Wiring: `uv tool install -p 3.13 serena-agent`; `.mcp.json` launches `.claude/mcp/serena.sh` (`--context claude-code --project <repo>`). Hooks: `serena-hooks activate` (SessionStart), `remind` (PreToolUse, nudges symbol tools after repeated grep/read), `cleanup` (SessionEnd). Config: `.serena/project.yml`; set `language_servers` to the stack once chosen (currently `bash`, auto-detected from this repo).
- Serena's maintainers say not to install it from MCP or plugin marketplaces; this follows their documented `uv` path.

### ast-grep
- What: structural (AST) search, rewrite and lint for 20+ languages.
- Use: `ast-grep run -p 'console.log($$$A)' -l ts`, `ast-grep run -p 'foo($A)' --rewrite 'bar($A)' -l ts -U`, `ast-grep scan` (project rules). Rules in `.ast-grep/rules/*.yml`, config `sgconfig.yml`; starter rules: `no-debugger` (error), `no-console-log` (warning) for TS/TSX/JS.
- Runs on staged JS/TS in the pre-commit hook.

### Context7 (upstash/context7)
- What: current library documentation and examples for the model, served over MCP.
- Wiring: remote HTTP server `https://mcp.context7.com/mcp` in `.mcp.json`; optional `CONTEXT7_API_KEY` header. Tools: `resolve-library-id`, `get-library-docs`.
- Rule: use it for any library/API/setup question instead of memory.

## Testing and preventing broken updates

### Playwright MCP (microsoft/playwright-mcp)
- What: Claude drives a real browser: navigate, snapshot (accessibility tree), click, type, screenshot, run assertions.
- Wiring: `.claude/mcp/playwright.sh` runs `npx @playwright/mcp@latest --headless --isolated`, adds `--no-sandbox` as root and uses the cloud container's Chromium at `/opt/pw-browsers/chromium`. Verified end-to-end in the cloud container.
- Use for every UI change: render at 360px, 768px and 1280px widths and look at the screenshots.

### lefthook (evilmartians/lefthook)
- What: fast git-hook manager; config in `lefthook.yml`, installed into `.git/hooks` by `lefthook install` (bootstrap does it).
- pre-commit (parallel): gitleaks on staged changes (fails closed), ast-grep on staged JS/TS, `npm run lint` when defined, beads export.
- pre-push: semgrep on the whole tree, then `npm run typecheck`, `test`, `build` when defined.
- Bypass only with a stated reason: `LEFTHOOK=0 git commit ...`.

### gitleaks
- What: secret detection. Config `.gitleaks.toml` extends the default ruleset and allowlists lockfiles.
- Use: pre-commit runs `gitleaks git --pre-commit --staged --redact`; on demand `gitleaks dir .` or `gitleaks git` (history). Mark intentional test values with `# gitleaks:allow`.
- Installed from the checksum-verified GitHub release (`GITLEAKS_VERSION` in bootstrap.sh).

### semgrep
- What: static analysis (SAST) with the community registry. Installed with `uv tool install semgrep`.
- Use: `semgrep scan --config p/default --metrics=off` (pre-push); add stack rulesets once chosen, for example `--config p/typescript --config p/react --config p/nodejs`. `--metrics=off` keeps it local; `semgrep login` is optional.
- Not installed: the Semgrep "Guardian" Claude plugin, which uploads every edited file to Semgrep's cloud and needs an account. Add it later if you want hosted findings.

### Official plugin marketplace (anthropics/claude-plugins-official)
- Used: `frontend-design` (vendored into `.claude/skills/frontend-design`, refresh with `scripts/sync-frontend-design-skill.sh`) and `superpowers`.
- Skipped on purpose: `code-review` (duplicates the built-in `/code-review`), `security-guidance` (LLM review on every stop, overlaps gitleaks + semgrep + `/security-review`; enable later if wanted), `context7`/`playwright`/`serena` plugin wrappers (replaced by `.mcp.json`, which also loads in cloud sessions, and Serena's own install path).

## Memory and project continuity

### claude-mem (thedotmack/claude-mem)
- What: captures observations from every session into a local SQLite + vector store, summarizes them, and injects relevant memory at the start of later sessions. Tools: `search`, `timeline`, `get_observations`; skill `/mem-search`.
- Wiring: user-scope plugin installed by `npx claude-mem install --provider claude` (bootstrap runs it on local machines). Worker: `npx claude-mem start|status|doctor`, viewer at http://127.0.0.1:37700. Data in `~/.claude-mem`.
- Limits: it lives in the home directory, so in a cloud session it only remembers that session. Durable cross-session context in the cloud comes from the committed files: `bd remember`, `.serena/memories`, OpenSpec specs, CLAUDE.md.

## Beautiful app and UI design

### frontend-design skill (Anthropic)
- Loaded automatically whenever UI work is described; it covers design direction, typography, spacing, motion and avoiding template-looking output.
- Finish rule: render in Playwright at three widths, inspect, iterate; no UI is done unseen.

## Automatic behaviours at a glance

| Moment | What happens |
|---|---|
| Session start | bootstrap installs missing tools; `bd prime` injects open work; Serena asks to activate the project; context-mode offers `ctx_resume` |
| Each prompt | context-mode journals it |
| Before a tool call | context-mode blocks oversized reads/fetches and names the `ctx_*` alternative; Serena reminds about symbol tools |
| After a tool call | context-mode indexes big output and returns the relevant slice |
| `git commit` | gitleaks, ast-grep, lint, beads export |
| `git push` | semgrep, typecheck, test, build |
| Session end | Serena hook cleanup; beads session-close protocol (close issues, file follow-ups) |
