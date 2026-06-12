# Full-Flow Task Execution — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

A task run by the board today goes implement → commit → human review: tests are
*requested* in the prompt but not enforced, and there is no automated code review.
This makes the board's autonomous execution match the terminal flow the owner uses
(brainstorm → spec → plan → subagent implement + two-stage review + test):

1. **In-agent review (no board change to orchestration):** when a task carries an
   attached plan, the dispatch prompt tells the headless agent to execute it using
   `superpowers:subagent-driven-development` — the agent internally does
   implement + spec-review + quality-review (headless jobs already load superpowers).
2. **Enforced test gate (board-side, independent):** after the implement job
   commits, the board itself runs the component's configured test command in the
   worktree; the task reaches `review` only if it passes.

The front half (brainstorm → spec → plan) is the already-built shaping gate — the
owner brainstorms in the terminal and attaches a plan; this spec covers the
execution rigor that follows.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Review | In-agent via `superpowers:subagent-driven-development` (prompt-driven, single job) — only when a plan is attached. Trivial (no-plan) tasks keep the current implement+commit prompt. |
| Test enforcement | Board runs a **per-component** test command after the implement commit; pass → review, fail → not review. |
| Test command source | `project-board/data/test-commands.json`, a `{ component: command }` map (gitignored with `data/`); seeded for gamesync. A component with no entry → gate skipped (logged), not blocked. |
| Where tests run | In the task's **worktree** (`bash -lc <cmd>`); commands must be self-sufficient there (a git worktree has no `node_modules` — node commands include `npm ci`). |
| Async | The gate runs as a non-blocking child process (never block the event loop), reusing the runner's existing proc machinery (running map / timeout / cancel / shutdown). |

## Prompt (buildTaskPrompt)

When `item.plan?.trim()` is present, replace the generic "implement + run tests"
instruction with a skill-driven one:

> An approved implementation plan is provided below. Use the
> `superpowers:subagent-driven-development` skill to execute it task-by-task:
> a fresh implementer per task (TDD), then a spec-compliance review and a code-
> quality review, fixing issues before moving on. Commit each task. Do NOT push,
> do NOT touch project-board/data/.

The APPROVED PLAN block (already injected) is what the skill executes. Without a
plan, the prompt is unchanged (implement + run relevant tests + commit). Either
way the board's test gate is the independent enforcement.

## Test gate (runner)

A `resolve`/`task` job (kind `!== 'rescan'`) that `completedSuccessfully` (exit 0 +
≥1 commit) does NOT go straight to `afterSuccess`. Instead:

- `testCommandFor(job)`: read `data/test-commands.json`; return the trimmed command
  for `item.component`, else `undefined`.
- If a command exists → `startTestGate(job, cmd)`:
  - `note(job, 'info', 'Test gate: <cmd>')`, then `spawnFn('bash', ['-lc', cmd], { cwd:
    worktree })`, stored as a `SegmentEntry` in `running` (holds the concurrency slot
    and makes `cancel`/`shutdown` work), `armTimer(job)`.
  - Stream the test stdout/stderr to the job log + console as `raw` events (NOT
    through `normalizeLine` — it is not stream-json).
  - On exit: remove from `running`, `clearTimer`; exit 0 → `afterSuccess` +
    `finish('succeeded')` (task → review); non-zero → `afterFailure(reason incl.
    cmd + exit code)` + `finish('failed')` (task → ready/backlog per the gate,
    worktree kept, log appended); then `pump()`.
- If no command → behave as today (`afterSuccess` + `finish('succeeded')`).

The gate reuses: `running` (slot + cancel target), `armTimer`/`clearTimer`
(timeout), `shutdown` (kills the gate proc → interrupted), `logFile`/`emit`
(console), `pump` (next job). No new concurrency concept.

Edge handling:
- Cancel during the gate kills the test proc → treated as a failed gate (task back
  to ready). Acceptable.
- Restart during the gate → the job recovers as `interrupted` like any job.
- The gate runs only for `task`/`resolve` jobs (kind `!== 'rescan'`); rescan
  unchanged.

## Config seed (gamesync)

`project-board/data/test-commands.json` seeded at deploy:
```json
{
  "cafe-service": "go test ./...",
  "idc-backend": "go test ./...",
  "launcher-downloader": "npm ci && npx vitest run",
  "launcher-user": "npm ci && npx vitest run",
  "launcher-packer": "npm ci && npx vitest run",
  "admin-web": "npm ci && npm run lint"
}
```
(`infra` left out → its tasks skip the gate until a command is added. Commands are
the owner's to tune; they run from the worktree root, so they `cd` into subdirs as
needed — e.g. a backend task's worktree is the gamesync root, so use
`cd idc_backend && go test ./...` if the component code lives in a subdir. Seed is a
starting point; adjust to the real subdir layout during deploy.)

## Cost note

`subagent-driven-development` inside a headless job spawns nested subagents
(implement + two reviews + fixes) → materially more tokens per task than a single
implement job. The owner accepted this; the test gate is the independent backstop
guaranteeing quality even if the in-agent review is imperfect. `maxAuto` +
concurrency remain the throttles.

## Testing

- `buildTaskPrompt` (prompt.test): with a plan → output references
  `subagent-driven-development`; without a plan → unchanged (no skill reference).
- Runner (runner.test, fake spawn): with a `test-commands.json` entry for the task's
  component, a successful implement (exit 0 + changedFiles>0) spawns a test-gate
  process (a second spawn, `bash -lc <cmd>`) and the task is NOT yet in review; the
  gate proc exit 0 → task `review`; exit 1 → task NOT review (ready/backlog) with a
  failure note; no entry → task goes straight to review (one spawn only); the gate
  proc is cancellable/holds the slot.
- Full suite + typecheck + grep-gate (UI unchanged) stay green.

## Out of scope

- A Settings UI to edit `test-commands.json` (file-edited for now).
- Board-orchestrated multi-job review stages (chose in-agent skill).
- Auto-retry on a failed gate; parallel multi-component gates.
- Verifying the in-agent reviews happened (the test gate is the enforceable check;
  the review is best-effort via the skill).
