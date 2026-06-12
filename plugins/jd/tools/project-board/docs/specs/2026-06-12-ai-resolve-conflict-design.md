# AI Resolve Merge Conflict — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

When a review task's branch conflicts with `main` (because main moved while the
task sat in review), the local Merge aborts cleanly and the owner must rebase/
resolve by hand or re-run the task from scratch. This adds a third option: a
headless `claude` job that brings the branch up to date with main and resolves
the conflict in place — so a conflicted task becomes mergeable without the owner
touching git or losing the AI's work.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Mechanism | A new job kind `resolve` that runs in the task's **existing** worktree (NOT recreated — preserves the committed work), with a prompt telling the agent to merge `main` in, resolve conflicts, run the relevant tests, and commit. |
| Trigger | A **contextual button** in the drawer: when a Merge attempt fails with a conflict, show "🤖 AI đồng bộ main + vá". Manual (the owner controls the token spend) — not auto-run. |
| After resolve | Task returns to **review** (the review gate stays). The owner re-clicks Merge — now clean. No auto-merge. |
| Strategy | The agent uses `git merge main` (a merge commit on the branch). The board squash-merges at the end, so the merge-commit noise is flattened — merge vs rebase is immaterial to the final main history. |
| Out of scope | Auto-resolve on conflict (manual button only); resolving non-review tasks; auto-merge after resolve. |

## Job model

`JobKind` gains `resolve`: `task | rescan | resolve`.

A `resolve` job is "branch-work" like `task` (it commits on `board/<id>` and the
board squash-merges it), but unlike `task` it does NOT recreate the worktree. So
the runner's kind checks split three ways:

- **`start()`** (worktree + prompt setup): a new `else if (job.kind === 'resolve')`
  branch — `cwd = git.worktreePath(taskId)` (the existing worktree), guard
  `git.hasWorktree(taskId)` (else fail "worktree missing; re-run the task
  instead"), set the task `ai_running` + `job`, `prompt = buildResolvePrompt(item,
  requirements)`. It must NOT call `createWorktree` (that resets the branch to main
  and wipes the work).
- **`completedSuccessfully()`** and the **onSegmentExit success branch** and the
  **failure-reason**: change `job.kind === 'task'` to `job.kind !== 'rescan'` so
  `resolve` shares the task path (success = `changedFiles(main...branch) > 0` →
  `afterSuccess` → review; failure = "process exited 0 but no commits found").

`afterSuccess` is unchanged — it sets the task to `review` and appends the changed-
files note, which is correct for a resolved branch.

## buildResolvePrompt (prompt.ts)

A new exported `buildResolvePrompt(item, requirements?)`:

- States the situation: "You are in a git worktree on branch `board/<id>`. `main`
  has advanced and this branch now conflicts with it."
- Instructs:
  1. `git merge main` (bring main's changes into this branch).
  2. Resolve ALL conflicts, preserving BOTH this task's intent AND main's changes.
  3. Run the tests relevant to the changed files.
  4. Commit the resolution (`git add` + `git commit`). Do NOT push; do NOT touch
     other branches; do NOT modify anything under `project-board/data/`.
  5. Verify `git diff main...HEAD` no longer reports conflicts.
- Includes the task title + body + (resolved) requirement context for intent,
  reusing the requirement-injection the task prompt uses (`extractReqIds`).

## Runner API

`dispatchResolve(taskId): Job` — `enqueue('resolve', taskId)` (mirrors
`dispatchTask`). The review/worktree guard lives in the route; `dispatchResolve`
just enqueues (the `start()` guard is the backstop for a missing worktree).

## Route

`POST /api/tasks/:id/resolve`:
- `requireReview(id)` (404 if missing, 409 if not in `review`).
- If `!git.hasWorktree(id)` → 409 "worktree đã mất — hãy chạy lại task" (a resolve
  needs the existing branch work).
- Else `return reply.code(202).send(deps.runner.dispatchResolve(id))`.

## UI

- **`api.ts`**: `resolve(id) → POST /api/tasks/:id/resolve`.
- **`TaskDrawer`**: the Merge action (`api.merge`) currently surfaces its error via
  `act()`'s catch into `error`. Track a `mergeConflict` flag set true when the
  merge error matches `/conflict/i`. When set (and status is still `review`), show a
  **"🤖 AI đồng bộ main + vá"** button beside the review actions. Clicking it calls
  `api.resolve(id)` (via `act`, `close: false`); the task moves to `ai_running` and
  the existing "Mở console" affordance lets the owner watch. On the task's return to
  `review`, the owner clicks Merge again. Reset `mergeConflict` on `item.id` change.
- Tokens-only per the Aurora design system.

## Error handling

- Resolve dispatched but the worktree is gone → 409 at the route (or `start()`
  fails the job with a clear message) → re-run the task instead.
- The agent fails to resolve (exits without a clean state / no commit) →
  `completedSuccessfully` is false → `afterFailure` → the task returns to `ready`
  (gated → `backlog`) with the failure note; the owner can re-run or resolve
  manually. Main is never touched (the resolve happens entirely in the worktree).
- A resolve job interrupted by a restart → recovered as `interrupted` like any job;
  the worktree is kept; re-trigger resolve.

## Testing

- `buildResolvePrompt` (prompt.test): contains the branch/merge-main instructions,
  the task title, and the requirement context when resolvable.
- Runner (runner.test, fake git/spawn): `dispatchResolve` creates a `resolve` job;
  `start()` for a `resolve` job uses the existing worktree path and does NOT call
  `createWorktree` (assert the fake git's `createWorktree` spy is not called and the
  cwd is `worktreePath`); on a successful resolve (changedFiles > 0) the task goes
  to `review`; a `resolve` with no worktree fails with a clear message; on failure
  the task leaves `ai_running`.
- Routes (routes.test): `POST /api/tasks/:id/resolve` → 202 for a review task with a
  worktree (fake git `hasWorktree → true`); 409 for a non-review task; 409 when
  `hasWorktree → false`.
- UI: not unit-tested beyond types; typecheck + `vite build ui` + grep-gate green.
- Full suite + typecheck stay green.

## Out of scope

- Auto-triggering resolve on any merge conflict (manual button only).
- Rebase (vs merge) strategy choice — the squash flatten makes it moot.
- Auto-merge after a successful resolve (review gate stays).
- Resolving conflicts for the PR (GitHub) path — that is resolved on GitHub.
