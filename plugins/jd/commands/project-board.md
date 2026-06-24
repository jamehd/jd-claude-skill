---
description: Set up, build, run, or restart the Project Board dashboard for a git repo — a LAN web board that tracks tasks/bugs as markdown and dispatches them to headless Claude Code. Per-project state lives in the target repo at `project-board/data/`.
argument-hint: "[optional: target repo path, or an action like 'restart' / 'build']"
---

# Project Board Setup

Invoke the `jd:project-board` skill to set up or operate the Project Board dashboard for a repository.

**Arguments:** $ARGUMENTS

Steps:
1. Load the `jd:project-board` skill via the Skill tool.
2. Resolve the target repo: a path in `$ARGUMENTS` if given, else the current repo. The tool ships with the plugin under `tools/project-board` — use that canonical copy, never a stale copy found elsewhere on disk.
3. Run the requirements check: target is a git repo with a `main` branch, `claude` CLI on PATH, `gh` CLI (optional, only for the Create PR button), Node 22+.
4. Build the tool once per machine (`npm install` + `npm run build`) and prepare the target repo's `project-board/data/` layout and `.gitignore` entries.
5. Start (or restart) the single server instance for that one target repo and report the LAN URL.
