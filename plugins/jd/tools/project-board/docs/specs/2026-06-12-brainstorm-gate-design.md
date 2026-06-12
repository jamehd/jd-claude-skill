# Brainstorm Gate (before Ready) — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

Auto-dispatch (Phase C) runs whatever sits in `ready` without supervision. A task
imported from a Re-scan candidate or quick-added by hand can be ill-shaped — a
large feature with no plan, a test task for a component that has no test runner.
Handing such a task straight to a headless agent is the risk the owner flagged:
non-trivial work needs brainstorming first (brainstorm → spec → plan), exactly the
flow used for the board's own features.

This adds a **shaping gate**: a non-trivial task cannot move to `ready` (and thus
cannot be auto-dispatched) until a plan is attached. Trivial tasks are unaffected.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Where brainstorm runs | In the owner's **terminal**, never headless on the board. The terminal is more capable and draws on the generous subscription allowance; the scarce headless token pool is reserved for *executing* an already-shaped plan. The board never spawns a brainstorm job. |
| Gate granularity | **Conditional, per task** — not every task. Small, self-evident tasks must NOT be forced through brainstorm. |
| Classification default | **By origin, one-button override.** Bulk-gen `Implement/Complete <req>` → requires shaping; bulk-gen `Add tests …` and manual quick-add → trivial. A toggle flips any task. |
| Gate strictness | **Hard** server-side block on the `→ ready` transition when shaping is required and no plan is attached. |
| Pipeline shape | **No new column** (a "Shaping" column would visually imply every task passes through it — the opposite of the trivial-stays-free goal). Use task fields + a badge. |
| Plan attachment | The `plan` field accepts **either** inline markdown **or** a repo-relative path to a committed plan file (e.g. `docs/plans/2026-….md`). Both are valid; presence (non-empty) is what opens the gate. |

## Data model

`BoardItem` gains two known frontmatter fields (added to the markdown known-keys
list so they are not swept into `extra`; parsed + serialized like `pr`/`job`):

- `requiresShaping: boolean` — whether this task is gated. Defaulted at creation by
  origin (below); flippable by the owner.
- `plan?: string` — the attached plan: inline markdown, or a repo-relative path to a
  committed plan file. Empty/absent means "not yet shaped".

Derived (not stored): a task is **shaped** when `plan` is non-empty; the gate is
**closed** for a task iff `requiresShaping && !plan?.trim()`.

### Defaults at creation

| Origin | `requiresShaping` |
|---|---|
| Bulk-gen candidate `kind: 'implement'` (`Implement/Complete <req>`) | `true` |
| Bulk-gen candidate `kind: 'test'` (`Add tests for <req>`) | `false` |
| Manual quick-add | `false` |

Implementation: the bulk-create route sets `requiresShaping` from the candidate
`kind`; quick-add and the generic create default it to `false`. `Candidate` carries
no new field — the route maps `kind === 'implement' → true`. Existing tasks (no
field in frontmatter) read as `requiresShaping: false` (backward compatible: old
tasks keep flowing freely).

## Gate enforcement (server is the source of truth)

The status transition to `ready` is the single choke point:

- The manual status PATCH (`PATCH /api/tasks/:id` with `status: 'ready'`, the only
  user path into `ready`) rejects with **409** and the message "Task cần brainstorm
  + đính plan trước khi sang Ready" when the gate is closed (message-based, matching
  the board's existing 409s for live-job delete and finalize-pr).
- All other transitions are unchanged. `backlog`, `review`, `done` stay in the
  `USER_STATUSES` whitelist; `ai_running`/`pr` remain system-managed.
- Bulk-gen always creates into `backlog`, so there is no path that lands a gated
  task directly in `ready`.
- `requiresShaping=false`, or any task with a non-empty `plan`, moves to `ready`
  freely.

Because `nextReadyTask` (auto-dispatch) only ever selects `status === 'ready'`
tasks, gating the `→ ready` transition is sufficient — a gated task can never reach
auto-dispatch.

## Brainstorm handoff to the terminal

A new route assembles a ready-to-paste kickoff prompt; the UI exposes it via a
**"Brainstorm"** button (shown only when `requiresShaping`).

`GET /api/tasks/:id/brainstorm-prompt` → `{ prompt: string }`, assembled from:
- the task title + body,
- the requirement statement + acceptance criteria resolved by `reqId` (reuse the
  existing requirements resolver / the `Req: <ID>` line in the body),
- a fixed instruction block: "Use the brainstorming skill to shape this task; write
  the spec to `docs/specs/…` and the plan to `docs/plans/…`; then attach the plan to
  this board task (paste it into the plan field, or set the plan field to the plan
  file path)."

The owner copies it, runs the brainstorm in their terminal, then fills the task's
`plan` field. No headless job is involved.

## Execution (plan injected into dispatch)

`buildTaskPrompt` already injects the requirement + AC. It additionally injects the
attached plan when present:
- If `plan` looks like a repo-relative path (matches a `*.md` path that exists under
  `repoRoot`), read that file and inject its contents under an "Approved plan
  (follow it)" heading.
- Otherwise treat `plan` as inline markdown and inject it directly.
- If `plan` is empty (only possible for non-gated tasks dispatched without shaping),
  behave exactly as today (requirement + AC only).

The review gate is unchanged — auto-dispatch still stops at `review`, never merges.

## UI

- **Card** (`Kanban.tsx`): a small badge — `⚙ cần nắn` when the gate is closed
  (`requiresShaping && !plan`), `✓ đã nắn` when `plan` is set; nothing for trivial
  tasks. Tokens-only (a distinct, low-emphasis hue per the Aurora design system).
- **Drag guard**: dropping a gate-closed task onto the Ready column is rejected
  client-side with the same nudge text; the server 409 is the backstop.
- **Drawer** (`TaskDrawer.tsx`):
  - a **toggle** "Cần brainstorm" (flips `requiresShaping` via PATCH),
  - a **"Brainstorm"** button (only when `requiresShaping`) that fetches the kickoff
    prompt and copies it to the clipboard (with a copied/confirmation state),
  - a **plan field**: a textarea to paste markdown or enter a `docs/plans/…` path,
    saved via PATCH; shows whether the gate is now open.
- `api.ts`: `getBrainstormPrompt(id)`, and `updateItem` already covers
  `requiresShaping`/`plan` PATCH.
- `DESIGN_SYSTEM.md`: document the two badges + token(s) used.

## Error handling

- `→ ready` on a gate-closed task → 409 with the message above; the drawer/board
  surfaces it and the task stays in place.
- `GET …/brainstorm-prompt` on a task whose `reqId` resolves to no requirement →
  still returns a useful prompt (title + body + the generic instruction), no error.
- A `plan` path that does not exist under `repoRoot` at dispatch time → fall back to
  treating the string as inline markdown (do not fail the job); the plan text the
  agent sees is then just the path string, which is degraded but non-fatal. (The
  owner is expected to paste content or a valid committed path.)

## Testing

- Markdown/store: `requiresShaping`/`plan` round-trip; absent → `requiresShaping`
  reads `false`, `plan` undefined.
- Gate: PATCH `→ ready` is 409 when `requiresShaping && !plan`; 200 when
  `requiresShaping=false`; 200 when `plan` is set; other transitions unaffected.
- Defaults: bulk-create sets `requiresShaping=true` for `implement` candidates,
  `false` for `test`; quick-add defaults `false`.
- Brainstorm prompt: route returns a non-empty prompt containing the task title and,
  when resolvable, the requirement/AC.
- Dispatch injection: `buildTaskPrompt` includes inline plan text; includes file
  contents when `plan` is an existing repo path; behaves as before when empty.
- Auto-dispatch is unaffected (it only sees `ready` tasks; gating happens upstream).
- Full suite + typecheck + grep-gate stay green.

## Out of scope

- Headless/AI brainstorming on the board (brainstorm stays in the terminal).
- Auto-merge / changing the review gate.
- Heuristic size/complexity classification beyond default-by-origin + manual toggle.
- A dedicated "Shaping" pipeline column.
- Auto-detecting whether a component has a test runner to set the test-task default
  (test tasks default trivial; the owner toggles the ones that need a harness first).
