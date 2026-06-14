# Board Filters + Bulk Actions — Design Spec

Date: 2026-06-14
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Purpose

The board renders every item across the Kanban columns with no way to narrow the
view or act on more than one item at a time. This adds:

1. **Filters** (client-side) to narrow the board by Service (component), shaped
   state (đã nắn / chưa nắn = has a plan or not), type (task/bug), and priority.
2. **Bulk actions** (server batch endpoint + selection UI) to delete, dispatch,
   change status, or set priority on many items at once.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Filters | Pure client-side over `snapshot.items`; no backend. Four axes, AND-composed. |
| Shaped definition | Binary: `shaped = !!item.plan?.trim()`. "Đã nắn" = has a non-empty plan; "Chưa nắn" = no plan. `requiresShaping` is NOT used by the filter. |
| Bulk mechanism | One server batch endpoint `POST /api/tasks/batch` (NOT a client-side N-request loop) — single broadcast, aggregated per-id result, reuses existing per-item guards. |
| Bulk actions | `delete`, `dispatch`, `status`, `priority`, `component`. |
| Selection scope | Client-side `Set<id>`; "select all (filtered)" selects visible items; changing any filter clears the selection. |
| Out of scope | Persisting filters (URL/localStorage), bulk merge/PR, multi-card drag-drop. |

## Filters (client-side)

A filter bar above the Kanban with four controls, AND-composed:

- **Service**: `all` + each distinct `component` present in `snapshot.items`.
- **Nắn**: `all` | `shaped` | `unshaped`.
- **Loại**: `all` | `task` | `bug`.
- **Ưu tiên**: `all` | `P0` | `P1` | `P2` | `P3`.
- A **"Xóa lọc"** button resets all four to `all`.

### Pure predicate module (`ui/src/filters.ts`)

Testable, no React:

```ts
export interface BoardFilter {
  component: string  // 'all' or a component name
  shaped: 'all' | 'shaped' | 'unshaped'
  type: 'all' | 'task' | 'bug'
  priority: 'all' | Priority
}

export const EMPTY_FILTER: BoardFilter = { component: 'all', shaped: 'all', type: 'all', priority: 'all' }

export function isShaped(item: BoardItem): boolean {
  return Boolean(item.plan && item.plan.trim())
}

export function isFilterActive(f: BoardFilter): boolean {
  return f.component !== 'all' || f.shaped !== 'all' || f.type !== 'all' || f.priority !== 'all'
}

export function applyFilters(items: BoardItem[], f: BoardFilter): BoardItem[] {
  return items.filter((it) => {
    if (f.component !== 'all' && it.component !== f.component) return false
    if (f.shaped === 'shaped' && !isShaped(it)) return false
    if (f.shaped === 'unshaped' && isShaped(it)) return false
    if (f.type !== 'all' && it.type !== f.type) return false
    if (f.priority !== 'all' && it.priority !== f.priority) return false
    return true
  })
}
```

`App` holds `const [filter, setFilter] = useState(EMPTY_FILTER)`, computes
`const visible = applyFilters(snapshot.items, filter)`, passes `visible` to Kanban,
and clears the bulk selection whenever `filter` changes.

## Selection + bulk bar (client-side)

- A **"Chọn"** toggle (`selectMode`) renders a checkbox on each visible card.
- Selection is `selected: Set<string>` of item ids.
- **"Chọn tất cả (đang lọc)"** sets selection to all `visible` ids;
  **"Bỏ chọn"** clears it.
- When `selected.size > 0`, a sticky bulk action bar shows `Đã chọn N` plus:
  - **Dispatch** → `batch('dispatch')`.
  - **Chuyển trạng thái ▾** (backlog/ready/review/done) → `batch('status', value)`.
  - **Ưu tiên ▾** (P0–P3) → `batch('priority', value)`.
  - **Xóa** → confirm (count + warns worktree/branch removal) → `batch('delete')`.
- Changing any filter clears `selected` (so actions never hit hidden items).
- After a batch call: show a short summary (e.g. `5 ok · 1 lỗi`); if any failed,
  list the failing ids + reason. Selection is cleared on full success; on partial
  failure the failed ids stay selected so the user can retry/inspect.

## Batch endpoint (server)

`POST /api/tasks/batch`, body `{ ids: string[]; action: BatchAction; value?: string }`:

```ts
type BatchAction = 'delete' | 'dispatch' | 'status' | 'priority' | 'component'
```

Validation (400 on failure):
- `ids` is a non-empty array of strings; each must satisfy `SAFE_ID`.
- `action` is one of the five.
- `status` requires `value` ∈ USER_STATUSES (`backlog|ready|review|done`).
- `priority` requires `value` ∈ PRIORITIES (`P0|P1|P2|P3`).
- `component` requires a non-empty `value`.
- `delete`/`dispatch` ignore `value`.

Per-id processing reuses the SAME guards as the single-item routes (no new policy):

| Action | Per-id behaviour (mirrors single route) |
|---|---|
| `delete` | 404 if missing; **skip with error** if a live (`running`/`queued`) job targets it; else `store.deleteItem` + best-effort `git.removeWorktree`. |
| `dispatch` | error if status ∉ `{backlog, ready}`; else `runner.dispatchTask(id)` (runner queues; concurrency unchanged). |
| `status` | apply the ready-shaping gate: `value === 'ready'` on an item with no plan → per-id error `'cần brainstorm + plan trước khi sang Ready'`; else `store.updateItem(id, { status: value })`. |
| `priority` | `store.updateItem(id, { priority: value })`. |
| `component` | `store.updateItem(id, { component: value })`. |

- Each id yields `{ id, ok: boolean, error?: string }`; a missing id →
  `{ id, ok: false, error: 'not found' }` (the batch never 404s as a whole).
- One `hub.broadcast({ type: 'board_update' })` after the loop (only if ≥1 applied).
- Response: `{ applied: number, failed: number, results: Array<{id, ok, error?}> }`.

Shared logic: the ready-shaping gate already lives in `gatedReadyStatus`/the PATCH
route. Extract a small helper if it reduces duplication, but do not change the
gate's behaviour.

## UI api client

`ui/src/api.ts`:

```ts
batch: (ids: string[], action: string, value?: string) =>
  request<{ applied: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>(
    '/api/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, action, value }) }),
```

## Design system

Tokens-only (Aurora). Reuse existing chip/select/button classes already used by
QuickAdd/SettingsPanel. Filter bar and bulk bar must pass the grep-gate (no raw
hex / arbitrary color values).

## Testing

- **`ui/src/filters.test.ts`** (vitest): `isShaped` (plan present/empty/absent);
  `applyFilters` for each axis and AND-composition; `isFilterActive`.
- **`server/src/routes.test.ts`**: batch `delete` (removes items, calls
  `removeWorktree`), `dispatch` (calls `runner.dispatchTask` for ready items,
  errors for non-dispatchable), `status` (ready gate: unshaped → per-id error,
  shaped/other status → applied), `priority`, `component`; partial failure
  (mixed valid + missing id → `applied`/`failed` counts + per-id results, still
  200); validation (`ids` empty → 400, bad `action` → 400, `status` without valid
  `value` → 400). Live-job delete guard reuses the fake runner's `listJobs`.
- UI: typecheck + `vite build ui` + grep-gate green. Selection/bulk-bar wiring is
  not unit-tested beyond types.
- Full suite + typecheck stay green.

## Out of scope

- Persisting the filter selection across reloads (URL params / localStorage).
- Bulk merge, bulk PR, bulk resolve, bulk brainstorm.
- Multi-select drag-and-drop between columns.
- Saved filter presets.
