# Project Board Job Console — Design Spec

Date: 2026-06-11
Status: approved (brainstorm session with jamehd)
Implements in: jd-claude-skill repo, `plugins/jd/tools/project-board`
Builds on: `2026-06-11-project-dashboard-design.md` (+ amendments) and the
Aurora design system (`DESIGN_SYSTEM.md` in the tool dir).

## Purpose

Open a live console per AI job: watch the running Claude session's output as
structured, streaming events (text as it is typed, tool calls, results) and
communicate back — send follow-up messages, or interrupt the current turn and
redirect the agent — from the dashboard or a dedicated browser tab.

## Verified technical constraints (drove the approach)

- `claude -p` cannot receive stdin messages mid-run; the process runs one
  prompt to completion and exits. (Agent SDK was evaluated and rejected: it
  queues messages at turn boundaries too — no true interjection — and requires
  `ANTHROPIC_API_KEY` billing instead of the owner's existing claude login.)
- Sessions are resumable: `claude -p "<msg>" --resume <session-id>` continues
  the same conversation; the session id is emitted in the
  `--output-format stream-json` event stream (`system/init` and `result`).
- `--output-format stream-json --verbose --include-partial-messages` emits
  NDJSON events including token-level text deltas and tool use.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Mechanism | CLI segment chain (option A); same `claude` login as today |
| Communication modes | `queue` (deliver at turn end) and `steer` (kill segment now, resume with the message) |
| Finished sessions | Continuable while the job's worktree+branch still exist (review state); read-only after merge/discard |
| Console form factor | Both (option C): near-fullscreen overlay in the dashboard AND dedicated route `/console/:jobId` for a separate tab |
| Event model | Server normalizes claude stream-json into a board-owned event schema; UI never parses claude internals |
| Visuals | Aurora design system; recipes extended in `DESIGN_SYSTEM.md` where needed |

## Job segments (runner model)

A job becomes a chain of `claude -p` processes sharing one Claude session and
one worktree:

```
segment 1: claude -p "<task prompt>"      --output-format stream-json ...
segment 2: claude -p "<user message>"     --resume <session-id> ...   (queue/steer)
segment N: ...                                                       (more messages)
```

- `Job` gains fields: `sessionId?: string`, `segments: number`.
- The job stays `running` across segments. **Completion check runs only when a
  segment exits and the message queue is empty**: success = last segment exit 0
  AND ≥1 commit on the branch (unchanged rule); rescan rule unchanged.
- A nonzero segment exit fails the job (existing failure flow) — queued
  messages are discarded with a console notice.
- The 2h timeout is a single budget for the whole chain (timer spans
  segments).
- `cancel` keeps its meaning: kills the current segment, job → `cancelled`.
- Steering kills are distinguished from cancel/timeout via an internal segment
  state (`steering`), so the exit handler starts the continuation instead of
  finishing the job.
- Race: a steer request arriving after the segment already exited (job still
  running with queued work, or just-completed evaluation in flight) degrades to
  the queue path. Harmless by construction: both paths start the same
  continuation segment.
- **Continue-after-finish**: for a job whose state is `succeeded`/`failed`/
  `interrupted`, a new message restarts the chain (`--resume`) IF the worktree
  and branch still exist; the job returns to `running` and its task to
  `ai_running`. After the chain ends, completion evaluation runs again (task
  back to `review` on success). If the worktree/branch are gone (merged or
  discarded), the message endpoint returns 409 and the console is read-only.
- Resume failure (session file missing/corrupt) fails the job with the error
  surfaced as a console event and in `job.error`.
- Server restart mid-segment: existing `interrupted` recovery applies; because
  `sessionId` is persisted, the console of an interrupted job offers
  "Tiếp tục phiên".

## Event pipeline

- Spawn args change to:
  `-p <prompt> --dangerously-skip-permissions --output-format stream-json --verbose --include-partial-messages`
  (continuations add `--resume <sessionId>`).
- Raw NDJSON stdout keeps being appended verbatim to `data/jobs/job-NNN.log`
  (now NDJSON content; stderr lines are stored as-is too).
- New pure module `server/src/jobs/events.ts` (TDD): `normalizeLine(line) →
  ConsoleEvent | null` mapping claude stream-json to the board schema:

```ts
type ConsoleEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_start'; toolId: string; tool: string; inputPreview: string }
  | { kind: 'tool_result'; toolId: string; output: string; isError: boolean }
  | { kind: 'turn_result'; ok: boolean; durationMs?: number; costUsd?: number }
  | { kind: 'note'; text: string }      // board-injected: user messages, steer/queue notices, errors
  | { kind: 'raw'; text: string }       // unparseable line fallback (incl. stderr)
```

- The runner feeds each stdout line through the normalizer: broadcasts
  `{type:'job_event', jobId, event}` over WS and captures `sessionId` from
  `init`. Board-side actions (user message accepted, steer, resume failure)
  are injected as `note` events and ALSO appended to the log file as
  board-marked NDJSON lines (`{"_board":"note","text":...}`) so replay is
  faithful.
- Replay: `GET /api/jobs/:id/events` parses the log file through the same
  normalizer and returns `ConsoleEvent[]`.
- The legacy `job_log` WS message and the ActivityPanel raw tail are replaced
  by `job_event` (ActivityPanel shows a short text-delta preview).

## API

| Route | Behavior |
|---|---|
| `GET /api/jobs/:id/events` | Normalized event history (replay). 404 unknown id; SAFE_ID-guarded |
| `POST /api/jobs/:id/message` | Body `{ text: string, mode: 'queue' \| 'steer' }`. Running job: queue appends to the job's message queue / steer kills the segment then continues. Finished job: continue-after-finish rules above (409 `worktree no longer exists` when unmergeable). 400 empty text; 409 for cancelled jobs and rescan-merged sessions |
| WS `job_event` | `{ type:'job_event', jobId, event: ConsoleEvent }` |

Rescan jobs get the same console (their session also supports queue/steer);
continue-after-finish for rescan requires the RESCAN worktree to still exist.

## UI

New shared component `ConsoleView` (one implementation, two mounts):

1. **Overlay** — near-fullscreen modal opened from a "Mở console" button on
   every ActivityPanel job entry (and from the TaskDrawer when its task has a
   job). ESC / ✕ closes. Contains a "↗ Tab riêng" button opening
   `/console/<jobId>`.
2. **Dedicated tab** — route `/console/:jobId`. The SPA reads
   `location.pathname`; the server serves `index.html` for any non-API GET
   path (catch-all after static), so deep links work.

ConsoleView layout (Aurora recipes; extend `DESIGN_SYSTEM.md` with a Console
recipe in the same change):

- **Header**: job id + kind, task id/title (link back to board), state pill,
  session id (mono, muted), elapsed time, segment count.
- **Stream area** (the bulk): assistant text rendered as it streams
  (`text_delta` accumulation, reading-baseline typography); `tool_start` as a
  collapsed card (mono tool name + one-line input preview) that expands to the
  `tool_result` output (sunken well, scrollable, error results in danger);
  `init`/`turn_result`/`note` as muted system lines (turn_result shows
  duration/cost when present); `raw` as muted mono lines. Auto-scroll pinned
  to bottom with a "↓ mới nhất" jump button when the user scrolls up.
- **Input bar**: textarea (Enter gửi, Shift+Enter xuống dòng) + two actions:
  "Gửi" (queue) and "⚡ Ngắt & chỉ đạo" (steer, with a one-line warning it
  stops the current turn). Disabled with explanatory placeholder when the
  console is read-only (merged/discarded/cancelled). For finished-but-
  continuable jobs the bar shows "Tiếp tục phiên" semantics (same endpoint).
- Multiple consoles may be open simultaneously (separate tabs); each
  subscribes to the shared WS and filters by jobId.

## Error handling

- Message to a dead/unresumable session → 409 with reason; console shows it
  as a `note`.
- WS drop in a console tab → existing reconnect; on reconnect the console
  re-fetches `/events` to heal gaps (events are append-only; client replaces
  its buffer).
- Normalizer never throws: unknown/garbled lines become `raw` events.
- Steer on a segment that cannot be killed (already exited) silently becomes
  queue (see race note).

## Testing

- `events.test.ts`: normalizer mapping for every ConsoleEvent kind, garbled
  input → raw, board-note lines round-trip.
- Runner tests (fake spawn): segment chaining on queue; steer kills + chains;
  completion deferred while queue non-empty; chain failure discards queue;
  continue-after-finish happy + 409 path; sessionId capture; total-timeout
  across segments.
- Route tests: message validation (400/404/409), events replay endpoint,
  SPA catch-all serves index.html for `/console/x`.
- Existing 65 tests stay green (spawn-arg changes are invisible to them —
  fake procs; completion rules unchanged).
- e2e (throwaway clone): stub claude that emits stream-json lines, then a
  queue message continuation, verifying console events + final review state.

## Out of scope

- True mid-turn interjection (not supported by the platform).
- Permission-approval UI (`canUseTool`) — revisit if the runner ever moves to
  the Agent SDK.
- Multi-user presence/locking on consoles (single owner).
- xterm/PTY rendering.
