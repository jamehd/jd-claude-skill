# jd-claude-skill

Personal Claude Code marketplace by **jamehd**. Houses the `jd` plugin and any future plugins under one namespace.

## What's inside

### Plugin `jd`

A growing library of personal engineering skills that work across projects: project specifics live in `<repo>/project-board/project.yaml` (reference: `plugins/jd/shared/project-config.md`). After install, every skill is namespaced `jd:<name>` and every command is invoked as `/jd:<name>`.

| Skill | Description |
|-------|-------------|
| `jd:ui-design-audit` | UI audit against `DESIGN_SYSTEM.md` / `design-theme-*.html` or a built-in default checklist. Reports severity-grouped, file+line-anchored findings. |
| `jd:error-audit` | Error-handling audit across code patterns, logging, notification routing, and user messages. Supports Node.js/TypeScript, Go, and Frontend (React/Vue/Next.js). Conformance mode enforces an adopted `error-standard.yaml` (from `jd:architect-error-system-design`): unknown codes, ad-hoc errors on covered paths, HTTP-status mismatch, hardcoded messages, registry drift. Outputs severity-classified report + per-finding fix files. Read-only. |
| `jd:db-audit` | Layered database audit. A static layer over the Prisma schema (missing FK indexes, timezone-naive timestamps, cascade and type review) and a runtime layer over the live PostgreSQL database (performance, security, schema, configuration, operations). Per-project scope, auto-detected or from `db-audit.config.json`. The runtime layer needs a read-only DB connection. Outputs a unified severity-classified report plus reviewable schema and SQL fixes (never executed). |
| `jd:architect-error-system-design` | Design and scaffold a unified, project-wide error system. Produces a language-agnostic error contract (`error-standard.yaml`: codes, HTTP mapping, localized messages, log/alert policy) plus idiomatic code per language. Adapters: TypeScript (Node/Next.js App Router) and Go; pluggable for more. Writes code behind human-gated decisions. The architect counterpart to `jd:error-audit`, which enforces the contract. |
| `jd:start-conversation` | Baseline working conventions applied to every conversation: English-only docs and source code, no redundant code comments (comment WHY, not WHAT), and mirror the user's conversation language (reply in Vietnamese when the user writes Vietnamese). Auto-loaded each session via a SessionStart hook; the user's explicit instructions always take precedence. |
| `jd:auto` | Autonomous end-to-end delivery: brainstorm, spec, plan, worktree, subagent TDD, review with domain audits, then integration per `git.integration` (PR by default), stopping only for architectural, hard-to-reverse or destructive decisions. Models, audits, design system and e2e notes come from `project.yaml`; runs on defaults without it. Board mode is commit-only. |
| `jd:plan-batch` | Morning planning pass for the project board: shapes rough intents and backlog items into agent-ready tasks (scope, `needsE2e`, requirement IDs, locked decisions), promoting to `ready` only on explicit operator OK. Requires `project.yaml`. |
| `jd:project-board` | Sets up and runs the Project Board dashboard (LAN web board that tracks tasks as markdown and dispatches them to headless Claude Code) for a repository, on Windows or Linux. Requires `project-board/project.yaml` and creates it from a template. |
| `jd:feature-flow` | Feature lifecycle for AI-built projects: the owner gives requirements and accepts, the AI drafts briefs with numbered acceptance scenarios (Gate A), builds with subagents test-first, re-runs every accepted scenario plus `jd:error-audit` / `jd:ui-design-audit`, prepares a dev environment for acceptance (Gate B) and merges only after acceptance. Hard limits (3 fix attempts, 2 rework rounds, one active feature by default; configurable in `limits.*`) with stop reports instead of loops. `git.integration` chooses pull-request or merge-after-acceptance. Project values in `project-board/project.yaml`, state in `project-board/data/`. |

| Command | Description |
|---------|-------------|
| `/jd:auto <request>` | Deliver a defined change autonomously, from brainstorm to PR (or merge after acceptance). |
| `/jd:plan-batch [intents]` | Shape the day's intents and backlog into agent-ready board tasks. |
| `/jd:project-board [path\|action]` | Set up, build, run or restart the Project Board for a repository. |
| `/jd:ui-design-audit [scope]` | Run the UI design audit. Optional `scope` argument restricts to a path. |
| `/jd:error-audit [scope\|stack\|conformance\|dry-run]` | Run the error-handling audit. Optional argument: scope path, stack filter (`nodejs`/`go`/`frontend`), `conformance` to check only against `error-standard.yaml`, or `dry-run` to list checks. |
| `/jd:db-audit [layer\|category\|url\|dry-run]` | Run the layered database audit. Optional argument: layer (`prisma`/`runtime`), category filter (`performance`/`security`/`schema`/`configuration`/`operations`), connection URL, or `dry-run`. |
| `/jd:architect-error-system-design [language\|path]` | Design and scaffold the unified error system. Optional argument: a language (`typescript`/`go`) to restrict the adapter, or a path to scope discovery. |
| `/jd:start-conversation` | Re-apply the baseline working conventions on demand (also auto-loaded each session via a SessionStart hook). |
| `/jd:status` | Feature flow: short summary of the active feature, items waiting for the owner, the queue and done features. |
| `/jd:next` | Feature flow: continue from the status file until the next gate or stop. |
| `/jd:feature <ID\|text>` | Feature flow: check needs and draft the brief and acceptance scenarios for owner approval (Gate A). |
| `/jd:build <ID>` | Feature flow: build an approved feature, re-run all accepted scenarios, audit, prepare dev acceptance (stops at Gate B). |
| `/jd:accept <ID> ok\|notes` | Feature flow: record the verdict — merge on ok, or start a rework round with notes. |

## Upgrading to 0.34.0

Every skill, hook and the board now read per-project settings from `<repo>/project-board/project.yaml` (keys: `plugins/jd/shared/project-config.md`).

- The board refuses to start without `project-board/project.yaml`; create it with `jd:project-board`. Add it before updating an existing project. For a GameSync-style project, copy the values from the old behaviour (ports, requirement headings, id pattern, e2e host); a worked example is `plugins/jd/tools/project-board/server/src/fixtures/gamesync.project.yaml`.
- The `.env` file in the tool folder is no longer loaded automatically; point `BOARD_ENV_FILE` at it (real environment variables still win).
- The `req-check-stop` hook stays silent until `project.yaml` exists.
- The board's `/api/info` is unauthenticated and returns only the project name.

## Hooks

Registered in `plugins/jd/hooks/hooks.json`, run through `hooks/run-hook.cmd` (works on Windows and Unix).

| Hook | Event | Behaviour |
|------|-------|-----------|
| `session-start` | SessionStart | Injects the `jd:start-conversation` conventions. Skipped when env `JD_CONVENTIONS=off` or `project.yaml` sets `hooks.conventions: false`. `language.*` in `project.yaml` takes precedence over the language rule. |
| `req-check-stop` | Stop | Advisory reminder when code mapped to a component changed without a matching requirement. Active only when `project.yaml` exists and `hooks.req_check` is not `false`; never blocks. |

## Tools

| Tool | Description |
|------|-------------|
| `plugins/jd/tools/project-board` | Fastify + React board server used by `jd:project-board`; needs `project-board/project.yaml`; configured by `board.*` and `BOARD_*` env vars (`BOARD_ENV_FILE` for an env file). |
| `plugins/jd/tools/req-check` | Zero-dependency Node CLI behind the Stop hook; verifies the `Req:` commit trailer against the requirements map. |

## Output convention

All skills follow one rule so a project stays tidy (full spec: `plugins/jd/shared/output-convention.md`):

- Transient reports, fix files, raw scans, and plans go under a single namespaced, git-ignored root: `.jd/<skill-name>/<timestamp>/`.
- Contracts and config that are the source of truth stay at the repo root and are committed: `error-standard.yaml`, `db-audit.config.json`, `error-audit.config.yaml`.
- Scaffolded source code goes where the project's code lives, never under `.jd/`.

## Install

In Claude Code, register this repo as a marketplace once, then install the plugin.

```text
/plugin marketplace add https://github.com/jamehd/jd-claude-skill.git
/plugin install jd@jd-claude-skill
```

After Claude Code restarts, the skills appear in the available-skills list with the `jd:` prefix and the commands appear in the slash menu.

To update later:

```text
/plugin marketplace update jd-claude-skill
```

## Local development

If you're editing the plugin on your own machine and want changes to take effect without re-pushing:

```bash
git clone git@github.com:jamehd/jd-claude-skill.git ~/jd-claude-skill
```

Then in Claude Code, add it as a local marketplace:

```text
/plugin marketplace add ~/jd-claude-skill
```

This mode reads files directly from your working tree — every edit is live after a session restart.

## Layout

```
jd-claude-skill/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   └── jd/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       ├── skills/          one folder per skill, each with SKILL.md
│       ├── commands/        one markdown file per /jd:<name> command
│       ├── hooks/           hooks.json, run-hook.cmd, session-start, req-check-stop
│       ├── shared/          project-config (reader + docs), requirements parser, output convention
│       └── tools/
│           ├── project-board/
│           └── req-check/
├── README.md
└── LICENSE
```

Adding a new skill: drop a folder under `plugins/jd/skills/<new-skill-name>/` with a `SKILL.md`. Bump the `version` in `plugins/jd/.claude-plugin/plugin.json` and push.

Adding a new plugin (different namespace, e.g. `jd-frontend`): add another folder under `plugins/` and another entry in `marketplace.json`.

## License

MIT. See [LICENSE](./LICENSE).
