# PR Lifecycle — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

Today "Tạo PR" pushes the branch, runs `gh pr create`, then marks the task
`done` immediately and buries the PR URL in the body. That is wrong on two
counts: the work is not done until the PR actually merges, and the PR result
isn't visible on the board. There is also no way to clean up the local branch +
worktree after the PR is merged on GitHub — they linger (e.g. TASK-003 today).

This adds a proper PR lifecycle: a distinct `pr` (PR open) status with the PR
link surfaced, and a gh-verified "PR merged → clean up" action that removes the
branch + worktree and moves the task to `done` only once the PR is truly merged.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Status on PR create | New `pr` (PR open) status — NOT `done`. `done` only after the PR merges. |
| `pr` status nature | System-managed (like `ai_running`): entered via Tạo PR, left via finalize; not a drag target. |
| Cleanup trigger | A "PR đã merge → dọn" button that verifies the PR is MERGED via `gh` before removing branch + worktree and setting `done`; 409 if not merged. |
| PR URL | Stored in a new frontmatter field `pr:` and surfaced as a clickable link on the card + drawer (not in the body). |
| Delete hygiene | DELETE also removes the task's worktree + branch (best-effort) so no orphans linger regardless of path. |

## Status model

`ItemStatus` gains `pr`: `backlog | ready | ai_running | review | pr | done`.

- `review → pr` happens only via the PR-create route.
- `pr → done` happens only via the finalize route (after gh confirms MERGED).
- `pr` is excluded from the manual-PATCH whitelist (`USER_STATUSES` stays
  `backlog, ready, review, done`); `ai_running` and `pr` are system-managed.
- The kanban gains a 6th column "PR mở" between "Review" and "Hoàn thành".
  `pr` cards are not draggable and the column is not a drop target.

`BoardItem` gains `pr?: string` (the PR URL). It is a known frontmatter key
(added to the markdown known-keys list so it is not swept into `extra`), parsed
and serialized like `job`.

## Routes

| Route | Behavior |
|---|---|
| `POST /api/tasks/:id/pr` (changed) | requireReview; `git.createPr` (push + `gh pr create`) → on success: `store.updateItem(id, { pr: <url>, status: 'pr' })` (NOT done), broadcast, return item. gh/push failure → 502 (unchanged). |
| `POST /api/tasks/:id/finalize-pr` (new) | The task must be in status `pr` (else 409 `task is <status>, not pr`). Verify via `git.isPrMerged(id)`: if not merged → 409 `PR chưa được merge`. If merged → `git.removeWorktree(id)`, `store.updateItem(id, { status: 'done' })`, broadcast, return item. gh error → 502. |
| `DELETE /api/tasks/:id` (changed) | After the existing live-job 409 guard + `store.deleteItem`, also call `git.removeWorktree(id)` (best-effort, swallow errors) so the branch + worktree never orphan. |

The existing `POST /api/tasks/:id/merge` (local squash → done, removes worktree)
is unchanged — that is the local fast path; the PR path is the GitHub flow.

## Git helper

`BoardGit.isPrMerged(taskId): boolean` (added to the `GitOps` interface):
- `assertSafeId(taskId)`, then `gh pr view <branch> --json state` in `repoRoot`,
  parse `state === 'MERGED'`. Run via the same error-wrapping pattern as
  `createPr` (gh stderr surfaced). If gh reports no PR for the branch, that is an
  error (→ surfaces as 502 at the route), not a silent false.

`createPr` is unchanged (still pushes + `gh pr create`, keeps the worktree).
`isPrMerged` and `createPr` are exercised manually/e2e (they need a real remote);
route tests use a fake git.

## UI

- **Kanban** (`Kanban.tsx`): add the `pr` column ("PR mở") to `COLUMNS`; add a
  `pr` entry to `STATUS_EDGE` and `STATUS_PILL`. `pr` cards: not draggable, the
  column not a drop target (same handling as `ai_running`). When `item.pr` is
  set, the card shows a small clickable "🔗 PR" link (opens `item.pr` in a new
  tab; `stopPropagation` so it doesn't open the drawer).
- **TaskDrawer** (`TaskDrawer.tsx`): when `status === 'pr'`, show the PR link
  prominently and a **"PR đã merge → dọn"** button (calls `api.finalizePr(id)`;
  on the 409-not-merged case, show the error inline and keep the panel open).
  The review-state actions (Merge / Tạo PR / Hủy bỏ) render for `review` only,
  as today.
- **Tokens** (`index.css`): add `--color-pr`, `--color-pr-bg`, `--color-pr-border`
  (a distinct hue from accent/ready/ok — an indigo/violet), used by the `pr`
  edge + pill, per the Aurora design system. Update `DESIGN_SYSTEM.md` (status
  color table + the card recipe note that `pr` cards carry a PR link).
- **api.ts**: `finalizePr(id) → POST /api/tasks/:id/finalize-pr`.

## Error handling

- finalize on a non-`pr` task → 409 (clear message).
- finalize when the PR is open-but-not-merged → 409 `PR chưa được merge`; the
  drawer surfaces it and stays open.
- gh failures (network, auth, no PR) → 502 with the gh stderr; surfaced in the
  drawer.
- DELETE's worktree cleanup is best-effort: a missing worktree does not fail the
  delete.

## Testing

- Server (vitest): `pr` is a valid status (markdown/store); `pr` frontmatter
  field round-trips. Routes: `/pr` sets `status:'pr'` + `pr:<url>` (fake git
  createPr returns a url) and does NOT set done; `/finalize-pr` with fake
  `isPrMerged → true` sets done + calls removeWorktree, with `false` → 409, on a
  non-pr task → 409; DELETE calls removeWorktree (spy) and still 200s. Extend the
  fake git (`isPrMerged`) in test-helpers + runner.test.
- UI: not unit-tested beyond types; manual e2e (create PR on a real review task →
  task to PR column with link → merge the PR on GitHub → finalize → done + branch
  /worktree gone).
- Full suite + typecheck + grep-gate stay green.

## One-off cleanup (during implementation)

Remove the lingering TASK-003 worktree + `board/TASK-003` branch (left by the
old PR flow) as part of deploying this.

## Out of scope

- Auto-polling gh for merge status (manual verified button only).
- Closing/abandoning an open PR from the board (the PR lives on GitHub; manage
  there).
- A separate "PR open" state for the local-Merge path (Merge stays → done).
