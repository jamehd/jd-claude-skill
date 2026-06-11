# jd-claude-skill

Personal Claude Code marketplace by **jamehd**. Houses the `jd` plugin and any future plugins under one namespace.

## What's inside

### Plugin `jd`

A growing library of personal engineering skills. After install, every skill is namespaced `jd:<name>` and every command is invoked as `/jd:<name>`.

| Skill | Description |
|-------|-------------|
| `jd:ui-design-audit` | UI audit against `DESIGN_SYSTEM.md` / `design-theme-*.html` or a built-in default checklist. Reports severity-grouped, file+line-anchored findings. |
| `jd:error-audit` | Error-handling audit across code patterns, logging, notification routing, and user messages. Supports Node.js/TypeScript, Go, and Frontend (React/Vue/Next.js). Conformance mode enforces an adopted `error-standard.yaml` (from `jd:architect-error-system-design`): unknown codes, ad-hoc errors on covered paths, HTTP-status mismatch, hardcoded messages, registry drift. Outputs severity-classified report + per-finding fix files. Read-only. |
| `jd:db-audit` | Layered database audit. A static layer over the Prisma schema (missing FK indexes, timezone-naive timestamps, cascade and type review) and a runtime layer over the live PostgreSQL database (performance, security, schema, configuration, operations). Per-project scope, auto-detected or from `db-audit.config.json`. The runtime layer needs a read-only DB connection. Outputs a unified severity-classified report plus reviewable schema and SQL fixes (never executed). |
| `jd:architect-error-system-design` | Design and scaffold a unified, project-wide error system. Produces a language-agnostic error contract (`error-standard.yaml`: codes, HTTP mapping, localized messages, log/alert policy) plus idiomatic code per language. Adapters: TypeScript (Node/Next.js App Router) and Go; pluggable for more. Writes code behind human-gated decisions. The architect counterpart to `jd:error-audit`, which enforces the contract. |
| `jd:start-conversation` | Baseline working conventions applied to every conversation: English-only docs and source code, no redundant code comments (comment WHY, not WHAT), and mirror the user's conversation language (reply in Vietnamese when the user writes Vietnamese). Auto-loaded each session via a SessionStart hook; the user's explicit instructions always take precedence. |

| Command | Description |
|---------|-------------|
| `/jd:ui-design-audit [scope]` | Run the UI design audit. Optional `scope` argument restricts to a path. |
| `/jd:error-audit [scope\|stack\|conformance\|dry-run]` | Run the error-handling audit. Optional argument: scope path, stack filter (`nodejs`/`go`/`frontend`), `conformance` to check only against `error-standard.yaml`, or `dry-run` to list checks. |
| `/jd:db-audit [layer\|category\|url\|dry-run]` | Run the layered database audit. Optional argument: layer (`prisma`/`runtime`), category filter (`performance`/`security`/`schema`/`configuration`/`operations`), connection URL, or `dry-run`. |
| `/jd:architect-error-system-design [language\|path]` | Design and scaffold the unified error system. Optional argument: a language (`typescript`/`go`) to restrict the adapter, or a path to scope discovery. |
| `/jd:start-conversation` | Re-apply the baseline working conventions on demand (also auto-loaded each session via a SessionStart hook). |

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
│       ├── skills/
│       │   └── ui-design-audit/
│       │       ├── SKILL.md
│       │       └── references/
│       └── commands/
│           └── ui-design-audit.md
├── README.md
└── LICENSE
```

Adding a new skill: drop a folder under `plugins/jd/skills/<new-skill-name>/` with a `SKILL.md`. Bump the `version` in `plugins/jd/.claude-plugin/plugin.json` and push.

Adding a new plugin (different namespace, e.g. `jd-frontend`): add another folder under `plugins/` and another entry in `marketplace.json`.

## License

MIT. See [LICENSE](./LICENSE).
