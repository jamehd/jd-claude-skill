---
name: project-board
description: Use when the user wants to set up, install, run, or restart the Project Board dashboard for a project — a LAN web board that tracks tasks/bugs as markdown and dispatches them to headless Claude Code. Triggers on "setup project board", "cài project board", "chạy project-board", "dashboard quản lý dự án cho project này", or when a repo needs a task board with AI dispatch.
---

# Project Board Setup

Set up the Project Board dashboard (ships with this plugin) for any git repository. The tool is a Fastify + React app; per-project state lives as markdown inside the TARGET repo at `project-board/data/`. One running server instance manages exactly one target repo.

**Tool location (canonical):** `<this skill's base directory>/../../tools/project-board` — the copy installed with the jd plugin. Do NOT hunt for other copies of the app elsewhere on disk (old worktrees, clones); they may be stale. Never write config into copies you find outside the plugin.

## Requirements check (do this first)

| Requirement | Check | If missing |
|---|---|---|
| Target is a git repo with a `main` branch | `git -C <target> rev-parse --verify main` | Merge gate needs `main`; warn user |
| `claude` CLI on PATH | `command -v claude` | Dispatch button will fail; tell user |
| `gh` CLI (optional) | `command -v gh` | Only the "Create PR" button needs it |
| Node 22+ | `node --version` | Required to run the server |

## Setup steps

1. **Build the tool** (once per machine): in the tool dir, `npm install`, then `npm run build`. Skip only if `dist/` and `ui/dist/` exist AND the plugin hasn't been updated since; when unsure, build — it's fast.

2. **Prepare the TARGET repo** (these are committed to the target's git):
   ```bash
   mkdir -p <target>/project-board/data/{tasks,status,jobs}
   printf 'jobs/\n' > <target>/project-board/data/.gitignore
   grep -qx '.board-worktrees/' <target>/.gitignore || echo '.board-worktrees/' >> <target>/.gitignore
   ```

3. **Config — pass env per process, do not share a `.env` between projects.** A `.env` in the tool dir silently applies to every project; with multiple boards it points `BOARD_REPO_ROOT` at the wrong repo. To require a login, generate a real password (never a placeholder):
   ```bash
   BOARD_PASSWORD=$(openssl rand -hex 8)
   ```
   Omit `BOARD_PASSWORD` entirely for a fully-open board on a trusted LAN. The dispatch endpoint executes code on this machine, so only omit it on a network you trust.

   | Variable | Required | Notes |
   |---|---|---|
   | `BOARD_REPO_ROOT` | yes | Absolute path to the target repo |
   | `BOARD_PASSWORD` | no | Omit for open access (trusted LAN only); set to require a login |
   | `BOARD_PORT` | no (4400) | Pick a distinct port per project |
   | `BOARD_HOST` | no (0.0.0.0) | Keep 0.0.0.0 for LAN access |
   | `BOARD_CLAUDE_BIN` | no (claude) | Override the AI binary |
   | `BOARD_MAX_JOBS` | no (1) | Keep 1 unless asked |

4. **Seed component status** so the board is useful on first open: write one file per major component to `<target>/project-board/data/status/<component>.md`:
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
   Assess the repo yourself to fill these in (component list from the repo's structure/docs). If the user prefers, leave status empty and tell them to press **Re-scan** in the UI — that dispatches an AI job to write these files (requires `claude` CLI).

5. **Start the server.** First make sure the port is free — other boards may already be running:
   ```bash
   ss -tln | grep :<port> && echo "taken, pick another port"
   ```
   Then start from the tool dir (or with `npm --prefix <tool-dir>`), env vars inline, in the background so the session isn't blocked:
   ```bash
   # password-protected
   nohup env BOARD_REPO_ROOT=<abs-target> BOARD_PASSWORD=<pw> BOARD_PORT=<port> \
     node dist/server/src/index.js > /tmp/project-board-<port>.log 2>&1 &

   # fully open (trusted LAN)
   nohup env BOARD_REPO_ROOT=<abs-target> BOARD_PORT=<port> \
     node dist/server/src/index.js > /tmp/project-board-<port>.log 2>&1 &
   ```
   (`npm start` runs the same `node dist/server/src/index.js`.) When password-protected, verify with a login curl — the endpoint is `POST /api/login` with body `{"password":"<pw>"}` (NOT `/api/auth/login`). When open, `GET /api/board` should return 200 directly. Report to the user: the URL `http://<lan-ip>:<port>` and, if set, the generated password. For 24/7 operation suggest a systemd unit (Linux) or scheduled task (Windows) running the same command. If you started a server only to verify setup, kill it and say so.

## Scope rules

- Only the TARGET repo and the plugin tool dir may be touched. Never modify other checkouts, worktrees, or another project's board data.
- The board's own writes (tasks, status, job logs, `.board-worktrees/`) all land in the target repo — the tool dir stays clean except `node_modules/`/`dist/`.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Reusing a `.env` written for another project | Server manages the wrong repo |
| Skipping the target `.gitignore` entries | `.board-worktrees/` and job logs pollute `git status` |
| Empty `status/` dir, no re-scan | KPI shows 0%, components panel empty |
| Target repo dirty or not on `main` when merging | Merge button returns 409 — by design, not a bug |
| Omitting `BOARD_PASSWORD` on an untrusted network | Dispatch endpoint executes code on this machine; anyone on the network can run jobs |
| Weak/hardcoded password | Dispatch endpoint executes code on this machine; LAN peers exist |
