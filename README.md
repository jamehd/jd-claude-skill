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
| `jd:feature-flow` | Feature lifecycle for AI-built projects: the owner gives requirements and accepts, the AI drafts briefs with numbered acceptance scenarios (Gate A), builds with subagents test-first, verifies in proportion to risk (tiers `low` / `medium` / `high`: fast `gate` scenarios and a short fail-fast soak every build; `nightly` scenarios and the full soak gate the release, not the merge; reviews finish before long runs) with numeric quality budgets (crashes, leaks, performance) plus `jd:error-audit` / `jd:ui-design-audit`, records time and token use per build (`tools/usage-report`), prepares a dev environment for acceptance (Gate B) and merges only after acceptance. Hard limits (3 fix attempts, 2 rework rounds, one active feature by default; configurable in `limits.*`) with stop reports instead of loops. `git.integration` chooses pull-request or merge-after-acceptance. Project values in `project-board/project.yaml`, state in `project-board/data/`. |

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

| Agent | Description |
|-------|-------------|
| `jd:qa-runner` | Read-only tester (Sonnet). Runs the acceptance scenario suite and verification actions from `project.yaml`, retries a failing test once to flag flakes, reports pass/fail per scenario with evidence. Never edits or fixes. Used by `jd:feature-flow` builds and for nightly regression runs. Complements the audits: audits read code, `qa-runner` runs the product. |
| `jd:security-reviewer` | Independent, read-only security review (Opus) of a git range: authentication, authorization, injection, secrets, personal data, payment integrity, uploads, client storage, dependencies. Severity-graded findings with exploit steps and fixes; verdict `BLOCK` on Critical/High. Used by `jd:feature-flow` when auth, personal data, payment or uploads change. |

Agents ship in `plugins/jd/agents/` as subagent types `jd:<name>` and are available to any session that has the plugin installed.

## Upgrading to 0.38.0

`jd:feature-flow` is fast to merge and strict to release (`references/tiers.md`, `references/quality.md`):

- The full `test_soak` gates the **release** for every tier, `high` included; merge needs the gate suite, reviews and `test_soak_short` (at least `quality.soak_short_hours`, default 2). New "Release gate" section: a release needs a passing nightly run and full soak on the release commit; failures on `git.main` become release-blocking tasks listed under "Release readiness" in the status file. A brief can still choose `merge` with the owner's approval and names the production switch for money or legacy paths.
- Soaks fail fast: budgets are checked every `quality.soak_check_minutes` (default 60) and the run stops at the first violation.
- Order is enforced: all reviews finish before load and soak runs; a fix is reviewed on its own diff before anything is re-measured, and passed measurements on untouched paths are kept.
- Measuring tools get a short dry run in the task that builds them; budgets measured above `quality.headroom_pct` (80) of their limit are raised at Gate A; a timing budget missed by at most `quality.timing_retry_pct` (10) is re-measured twice and judged by the median (`jd:qa-runner`).
- Missing `test_scenarios_only` / `test_scenarios_nightly` or a slow gate suite becomes a first task of the next build.
- Pipelining: `limits.features_active` counts only `building` and `stopped`; up to `limits.features_waiting` (2) features may wait in `acceptance` while the next one builds. Timing measurements take `<paths.data>/measure.lock` so they never run on a busy machine.

Existing projects: add the new `quality` keys and `limits.features_waiting` from `templates/project.yaml`, a "Release readiness" section to the status file, and make `test_soak_short` run for `soak_short_hours`.

## Upgrading to 0.37.0

`jd:feature-flow` verifies in proportion to risk (`references/tiers.md`):

- Briefs and tasks carry a risk tier (`low`, `medium`, `high`); the owner approves the feature's tier at Gate A. `high` tasks get `jd:security-reviewer` at task review, not only at the end.
- Implementers receive the review rules up front (`CLAUDE.md`, `error-standard.yaml`, matching `jd:security-reviewer` checklist rows) and record a "Self-check" in the task file before review; audits run before verification so findings are fixed in one cycle.
- Scenarios and budgets carry a suite: `gate` (fast, every build) or `nightly`. New optional actions `test_scenarios_nightly` (all suites) and `test_scenarios_only` (named tests, `{tests}` placeholder) let implementers and fix cycles run only what they touch; `jd:qa-runner` gains `gate`, `targeted` and `nightly` modes and verifies once per build.
- New action `test_soak_short` runs in builds; the full `test_soak` gates release (default) or merge (`quality.long_soak_gate`; `high` always merge, run while the owner accepts).
- Briefs list owner steps up front and are split above `limits.feature_new_scenarios` (8) new scenarios or `limits.feature_tasks` (6) tasks.
- Reports get a "Time and cost" section from `node plugins/jd/tools/usage-report/usage.mjs --repo <repo> --since <rev>`.

Existing projects: add `Suite` columns (missing means `gate`), `risk` and the new `quality`/`limits` keys from `templates/project.yaml`; until the new actions exist, mark them `pending: true` and the old behaviour applies (all scenarios in every build).

## Upgrading to 0.36.0

`jd:feature-flow` briefs gain a "Quality budgets" section: numeric budgets for crashes, leaks and performance, each a `<ID>-Q<n>` scenario measured by new optional actions `test_bench`, `test_load`, `test_soak` and checked by `jd:qa-runner` (`references/quality.md`). New key `quality.bench_regression_pct` (default 10). Existing projects: add the three actions as `pending: true` until a feature delivers them.

## Upgrading to 0.35.0

Adds the `jd:qa-runner` and `jd:security-reviewer` agents. `jd:feature-flow` build step 6 dispatches `jd:security-reviewer` for security-sensitive changes and step 7 runs verification through `jd:qa-runner`. No configuration change is needed.

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
│       ├── agents/          subagent definitions (qa-runner, security-reviewer)
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
