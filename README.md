# jd-claude-skill

Personal Claude Code marketplace by **jamehd**. Houses the `jd` plugin and any future plugins under one namespace.

## What's inside

### Plugin `jd`

A growing library of personal engineering skills. After install, every skill is namespaced `jd:<name>` and every command is invoked as `/jd:<name>`.

| Skill | Description |
|-------|-------------|
| `jd:self-review-ui` | UI audit against `DESIGN_SYSTEM.md` / `design-theme-*.html` or a built-in default checklist. Reports severity-grouped, file+line-anchored findings. |

| Command | Description |
|---------|-------------|
| `/jd:self-review-ui [scope]` | Run the UI self-review. Optional `scope` argument restricts to a path. |

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
│       │   └── self-review-ui/
│       │       ├── SKILL.md
│       │       └── references/
│       └── commands/
│           └── self-review-ui.md
├── README.md
└── LICENSE
```

Adding a new skill: drop a folder under `plugins/jd/skills/<new-skill-name>/` with a `SKILL.md`. Bump the `version` in `plugins/jd/.claude-plugin/plugin.json` and push.

Adding a new plugin (different namespace, e.g. `jd-frontend`): add another folder under `plugins/` and another entry in `marketplace.json`.

## License

MIT. See [LICENSE](./LICENSE).
