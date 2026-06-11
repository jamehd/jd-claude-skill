# Project Board CRUD + UX Batch — Design Spec

Date: 2026-06-11
Status: approved (brainstorm session with jamehd)
Implements in: jd-claude-skill repo, `plugins/jd/tools/project-board`
Builds on: the dashboard, Aurora design system (`DESIGN_SYSTEM.md`), and the job console.

## Purpose

A batch of UX/flow improvements so the board is usable for day-to-day driving:
full task/bug editing and deletion, mandatory descriptions (the AI needs them),
a redesigned detail panel that closes on outside-click and doubles as an edit
form, a clearly visible Execute action, distinct task-vs-bug and per-status
colors on cards, and a way to clear finished AI jobs. The overall layout
(KPI strip + Components | Kanban | Activity) stays as-is — the owner is happy
with it.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Layout | Unchanged (current three-region flat layout kept) |
| Create form | Title AND Description both required |
| Detail panel | Editable form; backdrop + outside-click + ESC close |
| Delete | Hard delete the file, behind a confirm dialog; blocked while a job runs |
| Execute | Lives in the detail panel; enabled for backlog / ready / failed |
| Card color | Type → tinted surface + TASK/BUG badge; Status → left edge + status pill |
| AI activity cleanup | Manual "Dọn xong" button clears finished jobs (files removed) |

## 1. Create form — require title + description

`QuickAdd` gains a **Description** textarea. Both `title` and `description`
are required: the submit button is disabled until both are non-blank, and the
server `POST /api/tasks` rejects (400) when either is missing. `description`
maps to the item `body`. Type / component / priority selectors unchanged
(priority defaults P2).

## 2. Detail panel — edit form, closes on outside-click

The right drawer (`TaskDrawer`) is restructured:

- **Dismissal**: a full-screen backdrop (`rgba(8,13,20,.7)`) sits behind the
  panel; clicking the backdrop closes it, as does ESC and the ✕ button.
  (Today the drawer has no backdrop, so outside-click does nothing.)
- **Edit form**: Title (input), Description (textarea), Priority (select),
  Component (select) are all editable. A **Lưu** (Save) button persists via
  `PATCH /api/tasks/:id` (the existing whitelist already covers
  title/body/priority/component). The form seeds from the current item and
  shows a dirty indicator; Save is disabled when unchanged or when title/
  description are blank. WebSocket board updates that change the underlying
  item while editing do not clobber unsaved edits (seed only on item id change).
- **Actions row**: `⚡ Giao cho AI` (Execute, §3), `Mở console` (when
  `item.job` exists), and **Xóa** (Delete, §4).
- Review-state actions (Merge / Tạo PR / Hủy bỏ) and the branch diff remain as
  today for `review` items.

## 3. Execute action

- The Execute button (`⚡ Giao cho AI`) is prominent at the top of the panel's
  action row. It is enabled when the item status is `backlog`, `ready`, or
  `failed` (a fresh dispatch), and disabled (hidden) for `ai_running`, `review`,
  `done` — those have their own affordances (console / continue / merge).
- Server: `POST /api/tasks/:id/dispatch` relaxes its status guard from
  `ready`-only to `{ backlog, ready, failed }`. The runner's existing
  `dispatchTask` already (a) blocks a second active job for the task and
  (b) sets the task to `ai_running` on start, so no runner change is needed.
- Dragging a card to the "AI đang làm" column is still disabled (system-managed,
  unchanged); Execute is the way to start a job. Other status drags unchanged.

## 4. Delete (full CRUD)

- `store.deleteItem(id)`: resolves the item's file (same lookup as `getItem`)
  and removes it; throws if not found.
- `DELETE /api/tasks/:id`: SAFE-id/existence guarded; **409 if the item status
  is `ai_running`** (a job is running on it — cancel first); otherwise deletes,
  broadcasts `board_update`, returns `{ ok: true }`. 404 unknown id.
- UI: the panel's **Xóa** button opens a small confirm dialog ("Xóa
  TASK-012? Không hoàn tác được."); on confirm, calls the endpoint and closes
  the panel. The kanban card itself has no delete affordance (avoids
  accidental clicks) — delete is panel-only.

## 5. Card colors — type and status both legible

A kanban card encodes two independent signals without collision:

- **Type → surface tint + badge.** TASK: faint cyan-tinted surface
  (`bg` around `#0e1b2b`, border `#1e3a52`) + a mono "TASK" badge in accent.
  BUG: faint red-tinted surface (`#241318`, border `#4a2230`) + a "BUG" badge
  in danger. Recognizable at a glance across the board.
- **Status → left edge + pill.** The 2px left border carries the status color
  (backlog→secondary, ready→ready, ai_running→running/accent, review & done→ok),
  and a small status pill (mono, the status triple) sits on the card. So a card
  shows: type tint + type badge, status edge + status pill, mono ID, priority
  color, title, component.
- Bug titles keep their danger tint. New tokens if needed
  (`--color-task-bg/border`, `--color-bug-bg/border`) are added to
  `index.css` `@theme` and documented in `DESIGN_SYSTEM.md`.

## 6. AI activity cleanup

- A **"Dọn xong"** button in the ActivityPanel header clears all finished jobs
  (state ∈ `succeeded | failed | cancelled | interrupted`) from the list.
- Server: `POST /api/jobs/clear-finished` → `runner.clearFinished()` removes
  those jobs from the in-memory map and deletes their `job-NNN.json` +
  `job-NNN.log` files; running/queued jobs are kept. Returns
  `{ cleared: number }`, broadcasts `board_update`.
- A job's console opened while it is cleared simply shows "không tìm thấy job"
  (existing ConsolePage behavior) — acceptable; the owner clears deliberately.

## Design system updates

`DESIGN_SYSTEM.md` gains/edits:
- **Card recipe**: type encoding (tint + badge) vs status encoding (edge + pill)
  made explicit, with the two new type tokens.
- **Detail panel recipe**: editable form layout, backdrop + outside-click close,
  action row (Execute / console / Delete), dirty/Save semantics.
- **Confirm dialog recipe**: small centered modal on the standard backdrop,
  danger-tinted confirm button.

## Testing

- Server (vitest): `store.deleteItem` (removes file, throws unknown);
  `DELETE /api/tasks/:id` (200, 404, 409-while-running); dispatch route accepts
  backlog/ready/failed and still 409s on ai_running/review/done; `POST
  /api/tasks` requires non-blank body (400); `clear-finished` removes finished
  jobs + files and keeps active ones (fake runner).
- UI gates: typecheck (both tsconfigs), `vite build`, full vitest suite stays
  green, grep-gate (no raw palette classes). No dedicated React render tests
  beyond the existing useBoard one; component correctness covered by the
  server-side route/store tests + manual e2e.
- e2e (throwaway clone): create task with description → edit it (PATCH) →
  Execute from backlog → job runs → delete a different task (200) → clear
  finished jobs.

## Out of scope

- Layout redesign (kept as-is).
- Inline (click-to-edit-in-place) editing — edits go through the panel form.
- Bulk operations, undo/restore, archive.
- Card-level delete/execute affordances (panel-only, by decision).
