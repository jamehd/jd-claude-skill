# GameSync Project Board — Design Spec

Date: 2026-06-11
Status: approved (brainstorm session with jamehd)

## Purpose

A personal, LAN-hosted dashboard for managing the development of the GameSync
project itself. It gives a single-glance view of project health (what is
complete, what is missing, per component), holds the backlog of tasks and bugs,
and lets the owner dispatch individual items to Claude Code for autonomous
processing — while keeping every result behind a human review gate.

Not part of the shipped product. Single user (project owner). Other LAN machines
may open the UI, so a minimal password gate protects the dispatch capability.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Audience | Owner only; internal dev tool for this repo |
| AI mechanism | Phase B now: per-task "Assign to AI" button spawning headless Claude Code; Phase C (auto-dispatch queue) later behind a flag |
| Data store | Markdown files with YAML frontmatter, committed in this repo (no database) |
| Project status | Dedicated status files per component, seeded from the 2026-06-11 assessment; refreshed via a special "Re-scan" AI job |
| Stack | Node server (Fastify) + Vite React SPA + Tailwind; WebSocket for live updates |
| Hosting | Runs persistently on the Linux box, binds `0.0.0.0:4400`; accessed at `http://192.168.1.36:4400` from any LAN machine |
| Layout | "Mission Control" single screen (option A of the layout mockups) |
| UI language | Vietnamese labels (per-user preference); source code and docs stay English |

## Directory layout

> **Amendment (2026-06-11):** the app was extracted to the jd plugin repo
> (`jd-claude-skill/plugins/jd/tools/project-board`) for reuse across
> projects; the `jd:project-board` skill sets it up per project. Only
> `project-board/data/` remains in each target repository.

```
project-board/
├── app/                  # Fastify server + Vite React UI (now lives in the jd plugin)
└── data/
    ├── tasks/            # TASK-NNN-<slug>.md, BUG-NNN-<slug>.md (one item per file)
    ├── status/           # <component>.md (idc-backend, cafe-service, launcher-*, admin-web, infra)
    └── jobs/             # job-NNN.log (AI run logs) + job-NNN.json (run metadata)
```

`data/status/` is committed to git. `data/tasks/` files live in the working
tree and are committed at the owner's discretion; the job pipeline does not
depend on them being tracked (task content is embedded in the AI prompt).
`data/jobs/` is gitignored: logs are bulky, transient, and reproducible from
the job that created them.

## Data model

### Task / bug file

`project-board/data/tasks/TASK-012-implement-gettheme-rpc.md`

```markdown
---
id: TASK-012            # TASK-* or BUG-*
type: task              # task | bug
title: Implement GetTheme RPC in cafe-service
status: ready           # backlog | ready | ai_running | review | done
priority: P1            # P0..P3
component: cafe-service # matches a status/ file name
created: 2026-06-11
updated: 2026-06-11
job: job-031            # last AI job id, optional
---

Description, context, acceptance criteria (free-form markdown).

## AI result            # appended by the server when the job completes
- summary of what was done, branch name, test results
```

- IDs are sequential per type, allocated by the server at creation time.
- The server derives the whole board state by scanning this directory; a file
  watcher (chokidar) pushes changes to the UI over WebSocket. Manual edits in
  any editor are picked up automatically.

### Component status file

`project-board/data/status/cafe-service.md`

```markdown
---
component: cafe-service
completion: 90          # percent, integer
last_scanned: 2026-06-11
---

One-paragraph summary of current maturity.

## Gaps
- [ ] GetTheme / GetVPNProfile / RegisterPC / ReportLaunch / ReportEvent RPCs
- [ ] DPAPI encryption for cafe-credential.enc
```

Initial content for all components is seeded from the 2026-06-11 whole-repo
assessment performed during this brainstorm.

## Server

Fastify, TypeScript, listening on `0.0.0.0:4400`.

### Auth

Single shared password set in `project-board/app/.env`
(`BOARD_PASSWORD`). Login issues a session cookie; every API route and the
WebSocket upgrade require it. Rationale: the dispatch endpoint executes code on
this machine and other devices exist on the LAN.

### REST API (sketch)

- `POST /api/login`
- `GET /api/board` — all tasks + status summaries (initial load)
- `POST /api/tasks` / `PATCH /api/tasks/:id` — create / update (writes markdown)
- `POST /api/tasks/:id/dispatch` — start an AI job for the task
- `POST /api/rescan` — start the special re-scan job
- `POST /api/jobs/:id/cancel`
- `GET /api/jobs/:id/log` — full log; live tail goes over WebSocket
- Review actions: `GET /api/tasks/:id/diff`, `POST /api/tasks/:id/merge`,
  `POST /api/tasks/:id/pr`, `POST /api/tasks/:id/discard`

### Job Runner (the AI integration)

Dispatching a task:

1. Create a git worktree + branch `board/<task-id>` from `main` (never touches
   the owner's working tree).
2. Spawn `claude -p` (headless) in that worktree. The prompt is built from a
   template plus the task file content, and instructs the AI to: implement the
   task following repo conventions (CLAUDE.md), run relevant tests, and commit
   everything to the branch. The AI does NOT edit the task file — it lives
   untracked in the owner's working tree and is absent from the job worktree;
   task state is owned by the server.
3. Stream stdout/stderr to `data/jobs/job-NNN.log` and over WebSocket to the
   AI Activity panel.
4. Completion detection: process exit code AND at least one commit on the
   branch. On success the server flips the main-tree task to `review` and
   appends the AI-result note; on failure the job is `failed` and the task is
   reset to `ready` with an error note appended.
5. Timeout (default 2h, configurable) → kill process, mark `failed`.
6. Concurrency limit: 1 running job (configurable). Additional dispatches queue.

Review gate: a task in `review` shows its branch diff in the UI; the owner
chooses Merge (fast-forward/squash into main), Create PR (`gh pr create`), or
Discard (delete branch + worktree). This matches the owner's existing habit of
inspecting worktrees before merge.

**Re-scan job**: same runner, fixed prompt — survey the repo (components,
implemented vs missing, test coverage, TODOs) and rewrite `data/status/*.md`.
Runs in a worktree like any job and goes through the same review gate; its only
expected changes are under `project-board/data/status/`. Completion detection
for this job type: process exit code AND at least one modified file under
`data/status/` (there is no task file to transition).

**Phase C path**: the runner already consumes from an internal queue; auto mode
is a config flag that, when idle, pulls the highest-priority `ready` task
automatically. No architectural change.

### Server restart mid-job

On boot, any job recorded as running is marked `interrupted`; its worktree is
left intact for inspection. The task returns to `ready`.

## UI — Mission Control (single screen)

Vite + React + Tailwind, Vietnamese labels.

- **KPI strip (top)**: overall completion %, open tasks, open bugs, running AI
  jobs.
- **Left column — Components**: one progress bar per `status/` file; click
  expands the gap checklist. "Re-scan" button lives here.
- **Center — Kanban**: 5 columns (Backlog, Ready, AI đang làm, Review, Done);
  drag-and-drop moves items (writes `status` to frontmatter). The "AI đang làm"
  (`ai_running`) column is system-managed — items enter it only via dispatch,
  never by drag. Quick-add modal
  with 3 fields (title, type, component); description editable later in the
  drawer.
- **Right column — AI Activity**: running job with live log tail; recent
  finished/failed jobs.
- **Task drawer**: full markdown view/edit, priority/component controls,
  "⚡ Giao cho AI" button, and for `review` tasks the diff + Merge / PR /
  Discard actions.
- All state updates arrive over WebSocket (no polling).

## Error handling

- Job failures (nonzero exit, timeout, missing status transition) surface in
  the AI Activity feed with the log attached; the task is annotated, never
  silently lost.
- Markdown parse errors (bad frontmatter after a manual edit) render the item
  in an "invalid" tray with the parse error instead of crashing the board.
- Discard always removes both branch and worktree; merge failures (conflicts)
  keep the branch and show the error.

## Testing

- Vitest unit tests: markdown (de)serialization round-trip, ID allocation,
  job state machine with a fake process runner, completion-detection rules.
- Light React component tests for the kanban state transitions.
- Manual e2e for the full dispatch→review→merge loop (requires real
  `claude` binary).

## Out of scope (for this iteration)

- Phase C auto-dispatch (designed for, not built).
- Multi-user accounts, roles, or external (internet) access.
- Mobile layout (desktop LAN browser only).
- Notifications (MQTT/mobile push) — could reuse project infra later.
