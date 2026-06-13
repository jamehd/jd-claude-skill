# Abandon Closed PR — Design Spec

Date: 2026-06-13
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Purpose

When a task's PR is closed on GitHub WITHOUT merging, the board has no graceful
cleanup: `finalize-pr` requires the PR be MERGED (409 otherwise), and the generic
DELETE removes the whole task + LOCAL worktree/branch but leaves the **remote**
GitHub branch (`board/<id>`) dangling. This adds a first-class "closed PR" cleanup
for `pr`-status tasks with two outcomes the owner chooses, both fully cleaning up
local + remote.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Trigger | A control on `pr`-status tasks in the drawer, offering two actions: **Làm lại** and **Bỏ hẳn**. |
| Làm lại (reopen) | Remove worktree + local branch + remote branch; task → `backlog` (re-dispatchable fresh later); clear the `pr` field. |
| Bỏ hẳn (delete) | Remove worktree + local branch + remote branch; **delete** the task entirely. |
| Remote branch | Both delete the GitHub branch `board/<id>` (`git push origin --delete`) — the gap DELETE doesn't cover. Best-effort: local cleanup + task transition always succeed even if the remote delete fails (offline / branch already gone); the response reports the remote result. |
| GitHub PR | The PR itself is closed by the owner on GitHub (the board does not close PRs). |

## Git helper

`BoardGit.deleteRemoteBranch(taskId): void` (add to the `GitOps` interface):
- `assertSafeId(taskId)`, then `git push origin --delete board/<id>` in `repoRoot`.
- Throws on failure (no remote, already deleted, auth) — the route wraps it
  best-effort so it never blocks the local cleanup.

(`removeWorktree` already removes the local worktree + local branch.)

## Route

`POST /api/tasks/:id/abandon-pr`, body `{ mode: 'reopen' | 'delete' }`:
- 404 if the task is missing; **409** if `status !== 'pr'`; **400** if `mode` is not
  `reopen`/`delete`.
- Always: `git.removeWorktree(id)` (local worktree + branch, best-effort) and
  `git.deleteRemoteBranch(id)` (remote, best-effort — capture success/error).
- `mode: 'delete'` → `store.deleteItem(id)`; return `{ ok: true, deleted: true, remote }`.
- `mode: 'reopen'` → `store.updateItem(id, { status: 'backlog', pr: '' })` (clears the
  PR link, re-opens to backlog); return the updated item + `remote`.
- Broadcast `board_update`.

(The existing `finalize-pr` — for the MERGED case — is unchanged.)

## UI

- **`api.ts`**: `abandonPr(id, mode) → POST /api/tasks/:id/abandon-pr { mode }`.
- **`TaskDrawer`** (`status === 'pr'` block, alongside the PR link + "PR đã merge →
  dọn"): add a "PR bị đóng (không merge)?" row with two buttons:
  - **Làm lại** → `api.abandonPr(id, 'reopen')` (task → backlog).
  - **Bỏ hẳn** → a confirm, then `api.abandonPr(id, 'delete')` (task removed).
  Both via the drawer's `act()` wrapper; on success close/refresh. Tokens-only.
- After either, the task leaves `pr` (→ backlog or gone) and the worktree/branches
  (local + remote) are cleaned.

## Note (re-suggestion)

If the underlying requirement is still `partial/missing` in the spec, Re-scan will
keep suggesting it as a candidate — abandoning a PR cleans the task/branches, not
the requirement. Truly dropping a feature is a separate spec-level descope of the
requirement doc (out of scope here).

## Testing

- `git.test` (real temp repo + a local **bare** remote): `deleteRemoteBranch` removes
  the pushed `board/<id>` ref from origin (assert `ls-remote` empty after).
- Routes (`routes.test`, fake git with `removeWorktree`/`deleteRemoteBranch` spies):
  `abandon-pr` mode `reopen` on a `pr` task → status `backlog`, `pr` cleared,
  both git cleanups called; mode `delete` → task gone (getItem undefined), cleanups
  called; non-`pr` task → 409; bad/absent mode → 400; a throwing `deleteRemoteBranch`
  still completes the local cleanup + transition (best-effort).
- UI: not unit-tested beyond types; typecheck + `vite build ui` + grep-gate green.
- Full suite + typecheck stay green.

## Out of scope

- Closing/abandoning the GitHub PR from the board (managed on GitHub).
- Descoping the requirement to stop re-suggestion (spec-level, separate).
- A dedicated "abandoned" status (reopen→backlog, drop→delete cover it).
