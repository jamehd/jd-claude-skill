# Auto-Dispatch (Phase C) — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

The original dashboard design reserved "Phase C": when idle, the board
automatically pulls the highest-priority ready task and runs it, so the owner
fills the backlog and the board cranks through it without clicking Execute each
time. The runner was built with the queue + concurrency machinery for exactly
this. This adds the auto-dispatch loop, a global on/off, and safety brakes —
while keeping the human review gate.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| How far automation goes | Auto-dispatches `ready → ai_running → review` and STOPS. Never auto-merges — the human review/merge gate stays. |
| Queue source | Only tasks the owner has moved to `ready`. Backlog is not auto-pulled. |
| On/off | A persisted toggle; **counters reset on each boot** (a reboot starts a fresh auto session with the same on/off + cap). |
| Failure brake | Auto pauses after **3 consecutive auto-job failures** (configurable); a success resets the counter; the owner resumes via the toggle. |
| Run cap | A per-session cap `maxAuto` (default 10): after N auto-dispatches, auto pauses for the owner to check in. |
| Concurrency | The existing `BOARD_MAX_JOBS` (default 1); auto runs up to that many in parallel. |

## Auto-dispatch engine (runner)

A new `autoTick()` on `JobRunner`:
- Guard: do nothing unless `auto.enabled && !auto.paused && auto.dispatched <
  auto.maxAuto && running.size < maxConcurrent`.
- Pick the next candidate: among `store.scan().items` with status `ready` and no
  active (queued/running) job, choose the highest priority (P0 > P1 > P2 > P3),
  tie-broken by oldest `created`. If none, stop.
- `dispatchTask(taskId)`; record the job id in an `autoJobs` set; increment
  `auto.dispatched`; persist; loop (fill remaining capacity).

Triggers for `autoTick()`:
1. When auto is enabled via the API.
2. At the end of every job's terminal handling (a slot just freed).
3. A periodic interval (every 8s) while auto is enabled — the catch-all that
   picks up tasks the owner drags into `ready` (the runner isn't notified of
   board edits otherwise). The interval is cleared when auto is disabled.

Auto only ever moves a task to `review` (via the normal success path /
`afterSuccess`); it never calls merge. The local Merge / Create-PR / finalize
actions remain manual.

## Safety brakes

State lives on the runner and persists to `project-board/data/auto.json`
(gitignored) so the on/off + `maxAuto` survive a restart:

```jsonc
{ "enabled": false, "maxAuto": 10, "failureThreshold": 3 }
```

Runtime counters (`dispatched`, `consecutiveFailures`, `paused`, `pauseReason`)
are NOT persisted — they reset to 0/false on boot, so a reboot is a fresh auto
session with the same enabled + maxAuto.

- **Consecutive-failure pause:** in the job terminal handler, if the finished
  job is in `autoJobs`: a `failed` outcome increments `consecutiveFailures`; on
  reaching `failureThreshold` (3), set `paused = true`, `pauseReason = "3 auto
  jobs failed in a row"`. A `succeeded` outcome resets `consecutiveFailures` to
  0. (Cancelled/interrupted: leave the counter unchanged.)
- **Run cap:** when `dispatched` reaches `maxAuto`, `autoTick` stops dispatching;
  the UI shows "đã chạy N/N — tạm dừng". Re-enabling (or raising maxAuto) resets
  `dispatched` to 0 and resumes.
- **On/off:** disabling stops the interval and prevents any further dispatch
  (running jobs finish normally). Enabling resets `dispatched`,
  `consecutiveFailures`, `paused`, kicks `autoTick`, and starts the interval.
- **Resume from pause:** re-POSTing enable (or a resume) clears `paused` +
  `consecutiveFailures` and ticks.

Concurrency is unchanged (`BOARD_MAX_JOBS`); auto respects it via the
`running.size < maxConcurrent` guard, so auto + N = N parallel autonomous jobs.

## API

| Route | Behavior |
|---|---|
| `GET /api/auto` | Returns `{ enabled, paused, pauseReason, maxAuto, dispatched, consecutiveFailures, maxConcurrent }`. |
| `POST /api/auto` | Body `{ enabled?: boolean, maxAuto?: number }`. Applies changes via `runner.setAuto(...)`: enabling resets counters + un-pauses + ticks + starts the interval; disabling stops it; setting `maxAuto` (≥1) persists it and, if currently capped, may resume. Returns the new state. Broadcasts `board_update`. |

Runner exposes `getAuto()`, `setAuto({enabled?, maxAuto?})`, `autoTick()`, and
loads/persists `auto.json`. The `WsMessage` set is unchanged (the UI reads auto
state via `GET /api/auto`, refreshed on `board_update` + the existing poll/WS).

## UI

An **"Tự động"** control in the App header (near "⊕ Thêm task / bug"):
- A toggle (Bật/Tắt). When off: "Tự động: Tắt".
- When on and running: "Tự động: Đang chạy · đã chạy {dispatched}/{maxAuto}".
- When paused: "Tự động: Tạm dừng — {pauseReason}" with a **Tiếp tục** button.
- A small settings affordance to set `maxAuto` (a number input in a popover, or
  inline). Tokens-only per the Aurora design system.
- Reads `GET /api/auto` on mount and re-fetches on `board_update`.

`api.ts`: `getAuto()`, `setAuto({enabled?, maxAuto?})`.

## Error handling

- `dispatchTask` inside `autoTick` is wrapped: if it throws (e.g. the rare
  duplicate-active-job race), that candidate is skipped, not fatal; autoTick
  continues to the next.
- `auto.json` missing/corrupt on boot → defaults (`enabled:false, maxAuto:10,
  failureThreshold:3`); never crashes boot (try/catch like recoverInterrupted).
- A board with zero `ready` tasks → autoTick is a no-op; the interval keeps
  checking cheaply.

## Cost / usage note

Auto-dispatch + concurrency consume the Claude plan's usage allowance faster
(each job is a full headless `claude -p` that itself fans out). The guards —
`maxAuto`, the consecutive-failure pause, and how many tasks the owner leaves in
`ready` — are the throttles. Deploy defaults: `BOARD_MAX_JOBS=1`, `maxAuto=10`,
`failureThreshold=3`. The owner raises concurrency / maxAuto deliberately.

## Testing

- Runner (vitest, fake spawn): enabling auto with two `ready` tasks dispatches
  the highest-priority one (and, at maxConcurrent 1, queues the loop so the next
  is picked on completion); priority + oldest-first ordering; auto never picks a
  `backlog` task; `dispatched` increments and stops at `maxAuto` (then paused);
  3 consecutive auto-failures → paused with reason, a success resets the counter;
  disabling stops further dispatch; counters reset on a fresh runner (boot);
  `autoTick` skips tasks that already have an active job.
- Routes: `GET /api/auto` shape; `POST /api/auto` enable/disable/setMaxAuto +
  resume-from-pause; broadcasts.
- The periodic interval: tested indirectly (call `autoTick()` directly in unit
  tests; the interval is a thin `setInterval(autoTick, 8000)` wrapper started/
  stopped by setAuto, `.unref()`'d).
- Full suite + typecheck + grep-gate stay green.

## Out of scope

- Auto-merge or auto-PR (stops at review by decision).
- Auto-pulling backlog or chaining scan→bulk-gen→auto (queue is manual `ready`).
- Time-of-day / off-peak scheduling.
- Per-task auto opt-out flags (the `ready` column IS the opt-in).
