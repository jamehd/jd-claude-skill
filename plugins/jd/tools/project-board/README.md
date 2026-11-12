# project-board

LAN dashboard and AI dispatch server that can be pointed at any git repository.
Tracks tasks/bugs in markdown files, lets you dispatch them to headless Claude Code,
review the diff, and merge or discard — all from a browser on your local network.

## Setup

```bash
cd plugins/jd/tools/project-board
cp .env.example .env
# Edit .env: set BOARD_PASSWORD and BOARD_REPO_ROOT, then start with BOARD_ENV_FILE=.env
npm install
npm run build
BOARD_ENV_FILE=.env npm start   # serves UI + API, default http://0.0.0.0:4400
```

### Per-project configuration

The board reads `<BOARD_REPO_ROOT>/project-board/project.yaml` (see `../../shared/project-config.md`)
and refuses to start without it (exit 1; run the `jd:project-board` setup skill to create it).
Keys used by the board:

| Key | Default | Effect |
|---|---|---|
| `project` | repo folder name | Page and login title |
| `board.port` | `4400` | Listen port (integer 1-65535) |
| `board.data_dir` | `project-board/data` | Data directory, relative to the repo |
| `board.branch_prefix` | `board/` | Task branch prefix |
| `git.main` | `origin/HEAD`, else `main` | Branch worktrees start from and merges target |
| `git.remote_name` | `origin` | Remote used for push and PR |
| `git.integration` | `pull-request` | `pull-request` keeps the needsE2e routing (auto-PR when `needsE2e: false`); `merge-after-acceptance` sends every successful job to `review` and never opens a PR |

Environment variables override the matching config values (`BOARD_PORT`, `BOARD_REPO_ROOT`, ...).

### Several projects on one machine

Run one board per project, each with its own `BOARD_REPO_ROOT` and a distinct `board.port`.
The session cookie is named `board_session_<port>`, so logging in to one board does not log out another
in the same browser. Use `BOARD_ENV_FILE` to point each instance at its own env file; `.env` in the
tool folder is no longer loaded automatically.

On Windows (and Linux) the same commands apply. Claude is spawned through the shell on Windows so
`claude.cmd` resolves; the per-component test gate runs through `cmd /c` unless `BOARD_TEST_SHELL=bash`
(use that when Git Bash is installed and the test commands are POSIX shell). Node 22.12+ is required.

### Required environment variables

| Variable | Description |
|---|---|
| `BOARD_PASSWORD` | Login password for the web UI |
| `BOARD_REPO_ROOT` | Absolute path to the target project repository |

### Optional

| Variable | Default | Description |
|---|---|---|
| `BOARD_PORT` | `board.port` (4400) | Server port |
| `BOARD_ENV_FILE` | none | Path to an env file to load (replaces the implicit `.env`) |
| `BOARD_TEST_SHELL` | `cmd` on Windows, `bash` elsewhere | Set to `bash` to run test gates with `bash -lc` on Windows |
| `BOARD_HOST` | `0.0.0.0` | Bind address |
| `BOARD_JOB_TIMEOUT_MS` | `7200000` | Per-job Claude timeout (2 h) |
| `BOARD_MAX_JOBS` | `1` | Max concurrent Claude jobs |
| `BOARD_CLAUDE_BIN` | `claude` | Path to the Claude CLI binary |

## Data layout (created inside the target repo)

```
<BOARD_REPO_ROOT>/
└── project-board/
    └── data/
        ├── tasks/      # one .md file per task/bug (frontmatter: id, type, status, priority, component)
        ├── status/     # per-component completion summaries; refresh via the Re-scan button
        └── jobs/       # AI job logs and metadata (add to .gitignore in the target repo)
```

Add these lines to the target repo's `.gitignore`:

```
.board-worktrees/
project-board/data/jobs/
project-board/data/auto.json
```

## Dev mode

```bash
npm run dev:server   # tsx watch server (port 4400)
npm run dev:ui       # Vite dev server (proxies /api and /ws to 4400)
```

## Automation

The `jd:project-board` skill (written separately) automates the setup steps above.
