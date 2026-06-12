# project-board

LAN dashboard and AI dispatch server that can be pointed at any git repository.
Tracks tasks/bugs in markdown files, lets you dispatch them to headless Claude Code,
review the diff, and merge or discard — all from a browser on your local network.

## Setup

```bash
cd plugins/jd/tools/project-board
cp .env.example .env
# Edit .env: set BOARD_PASSWORD and BOARD_REPO_ROOT
npm install
npm run build
npm start          # serves UI + API, default http://0.0.0.0:4400
```

### Required environment variables

| Variable | Description |
|---|---|
| `BOARD_PASSWORD` | Login password for the web UI |
| `BOARD_REPO_ROOT` | Absolute path to the target project repository |

### Optional

| Variable | Default | Description |
|---|---|---|
| `BOARD_PORT` | `4400` | Server port |
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
