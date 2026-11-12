---
name: project-board
description: Use when the user wants to set up, install, run, or restart the Project Board dashboard for a project — a LAN web board that tracks tasks/bugs as markdown and dispatches them to headless Claude Code. Requires project-board/project.yaml in the target repo (this skill creates it). Triggers on "setup project board", "cài project board", "chạy project-board", "dashboard quản lý dự án cho project này", or when a repo needs a task board with AI dispatch.
---

# Project Board Setup

Set up the Project Board dashboard (ships with this plugin) for any git repository. The tool is a Fastify + React app; per-project state lives as markdown inside the TARGET repo under `board.data_dir` (default `project-board/data`). One running server instance manages exactly one target repo. Steps work on Windows (PowerShell) and on Linux/macOS (bash); both variants are given where they differ.

**Tool location (canonical):** `<this skill's base directory>/../../tools/project-board` — the copy installed with the jd plugin. Do NOT hunt for other copies of the app elsewhere on disk (old worktrees, clones); they may be stale. Never write config into copies you find outside the plugin.

## project.yaml is required

The board refuses to start without `<target>/project-board/project.yaml` (it exits naming that file and this skill). Keys, defaults and validation: `../../shared/project-config.md`. The board reads `board.port`, `board.data_dir`, `board.branch_prefix`, `git.main`, `git.remote_name`, `git.integration`, `tasks.id_prefix`, `requirements.*`, `e2e.*`, `language.*`.

If the file is missing, copy `templates/project.yaml` (this skill's minimal board template; the fuller feature-flow one is `../feature-flow/templates/project.yaml`) to `<target>/project-board/project.yaml` and fill `project`, `requirements.id_example` and `board.port`. Ask only for what cannot be inferred. Invalid YAML or a wrong type makes the board refuse to start with a message naming the file and key.

## Requirements check (do this first)

| Requirement | Check | If missing |
|---|---|---|
| Target is a git repo with the main branch (`git.main`, default `origin/HEAD` target or `main`) | `git -C <target> rev-parse --verify <main>` | Merge gate needs it; warn user |
| `claude` CLI on PATH | bash `command -v claude`; PowerShell `Get-Command claude` | Dispatch button will fail; tell user |
| `gh` CLI (optional) | bash `command -v gh`; PowerShell `Get-Command gh` | Only the "Create PR" button needs it |
| Node 22+ | `node --version` | Required to run the server |

On Windows the board spawns `claude` with the prompt on stdin, so no quoting workarounds are needed. Optional `BOARD_TEST_SHELL` selects the shell used for test commands.

## Setup steps

1. **Build the tool** (once per machine): in the tool dir, `npm install`, then `npm run build`. Skip only if `dist/` and `ui/dist/` exist AND the plugin hasn't been updated since; when unsure, build.

2. **Prepare the TARGET repo** (committed to the target's git). Use `board.data_dir` for `<data>`:

   bash:
   ```bash
   mkdir -p <target>/<data>/{tasks,status,jobs}
   printf 'jobs/\nauto.json\n' > <target>/<data>/.gitignore
   grep -qx '.board-worktrees/' <target>/.gitignore || echo '.board-worktrees/' >> <target>/.gitignore
   ```
   PowerShell:
   ```powershell
   foreach ($d in 'tasks','status','jobs') { New-Item -ItemType Directory -Force "<target>\<data>\$d" | Out-Null }
   Set-Content -Path "<target>\<data>\.gitignore" -Value "jobs/", "auto.json"
   if (-not (Select-String -Path "<target>\.gitignore" -Pattern '^\.board-worktrees/$' -Quiet -ErrorAction SilentlyContinue)) { $gi = "<target>\.gitignore"; $nl = if ((Test-Path $gi) -and (Get-Item $gi).Length -gt 0 -and ((Get-Content $gi -Raw) -notmatch "\n$")) { "`n" } else { "" }; Add-Content $gi ($nl + ".board-worktrees/") }
   ```

3. **Config — pass env per process, do not share a `.env` between projects.** A `.env` in the tool dir silently applies to every project. To use an env file anyway, set `BOARD_ENV_FILE=<abs path>`; the board never loads an implicit `.env`, and real environment variables override the file. To require a login, generate a real password (never a placeholder), same command on every OS:
   ```
   node -e "console.log(require('crypto').randomBytes(8).toString('hex'))"
   ```
   Omit `BOARD_PASSWORD` entirely for a fully-open board on a trusted LAN. The dispatch endpoint executes code on this machine, so only omit it on a network you trust.

   | Variable | Required | Notes |
   |---|---|---|
   | `BOARD_REPO_ROOT` | yes | Absolute path to the target repo |
   | `BOARD_ENV_FILE` | no | Absolute path of an env file to load; fails if it does not exist |
   | `BOARD_PASSWORD` | no | Omit for open access (trusted LAN only); set to require a login |
   | `BOARD_PORT` | no | Overrides `board.port` (default 4400); keep one distinct port per project |
   | `BOARD_HOST` | no (0.0.0.0) | Keep 0.0.0.0 for LAN access |
   | `BOARD_CLAUDE_BIN` | no (claude) | Override the AI binary |
   | `BOARD_MAX_JOBS` | no (1) | Keep 1 unless asked |
   | `BOARD_TEST_SHELL` | no | Shell used to run test commands |

   The login cookie is per port, so two boards on different ports in one browser do not log each other out.

4. **Seed component status** so the board is useful on first open: write one file per major component to `<target>/<data>/status/<component>.md`:
   ```markdown
   ---
   component: <name>
   completion: <0-100>
   last_scanned: <today YYYY-MM-DD>
   ---

   One-paragraph maturity summary.

   ## Gaps
   - [ ] <missing thing>
   ```
   Assess the repo yourself (component list from the repo's structure and `requirements.dir`). If the user prefers, leave status empty and tell them to press **Re-scan** in the UI — that dispatches an AI job to write these files (requires `claude` CLI).

5. **Start the server.** Take the port from `board.port` (override with `BOARD_PORT`). First make sure it is free — other boards may already be running. The check is the same on every OS:
   ```
   node -e "require('net').createServer().once('error',()=>{console.log('taken');process.exit(1)}).listen(<port>,()=>{console.log('free');process.exit(0)})"
   ```
   Then start from the tool dir in the background so the session isn't blocked. Logs go to `<data>/jobs/server.log` (git-ignored via `jobs/`).

   bash:
   ```bash
   cd <tool-dir>
   BOARD_REPO_ROOT=<abs-target> BOARD_PASSWORD=<pw> nohup node dist/server/src/index.js \
     > <abs-target>/<data>/jobs/server.log 2>&1 &
   ```
   PowerShell (paths with spaces are fine when quoted):
   ```powershell
   $env:BOARD_REPO_ROOT = "<abs-target>"; $env:BOARD_PASSWORD = "<pw>"
   Start-Process node -ArgumentList 'dist/server/src/index.js' -WorkingDirectory "<tool-dir>" -WindowStyle Hidden `
     -RedirectStandardOutput "<abs-target>\<data>\jobs\server.log" -RedirectStandardError "<abs-target>\<data>\jobs\server.err.log"
   ```
   Leave out `BOARD_PASSWORD` for an open board. (`npm start` runs the same `node dist/server/src/index.js`.)

   Verify: when password-protected, `POST /api/login` with body `{"password":"<pw>"}` (NOT `/api/auth/login`); when open, `GET /api/board` returns 200. If it exits immediately, read the log: a missing or invalid `project.yaml` is named there. Report the URL `http://<lan-ip>:<port>` and, if set, the generated password. For 24/7 operation suggest a systemd unit (Linux) or scheduled task (Windows) running the same command. If you started a server only to verify setup, stop it (`Stop-Process` / `kill`) and say so.

## Scope rules

- Only the TARGET repo and the plugin tool dir may be touched. Never modify other checkouts, worktrees, or another project's board data.
- The board's own writes (tasks, status, job logs, `.board-worktrees/`) all land in the target repo — the tool dir stays clean except `node_modules/`/`dist/`.
- Tasks managed by `jd:feature-flow` (their `epic` names an existing `features/<ID>/`) are read-only on the board.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Starting without `project-board/project.yaml` | Board exits and names the file; create it first |
| Reusing an env file written for another project | Server manages the wrong repo |
| Skipping the target `.gitignore` entries | `.board-worktrees/` and job logs pollute `git status` |
| Empty `status/` dir, no re-scan | KPI shows 0%, components panel empty |
| Target repo dirty or not on the main branch when merging | Merge button returns 409 — by design, not a bug |
| Omitting `BOARD_PASSWORD` on an untrusted network | Dispatch endpoint executes code on this machine; anyone on the network can run jobs |
| Weak/hardcoded password | Dispatch endpoint executes code on this machine; LAN peers exist |
