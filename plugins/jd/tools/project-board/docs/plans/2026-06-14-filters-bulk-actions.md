# Board Filters + Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side board filters (Service / shaped / type / priority) and multi-select bulk actions (delete / dispatch / status / priority) backed by one server batch endpoint. Per spec `docs/specs/2026-06-14-filters-bulk-actions-design.md`.

**Architecture:** Filters are a pure, testable predicate module consumed by `App` (no backend). Bulk actions are a single `POST /api/tasks/batch` route that loops over ids reusing the existing per-item guards and emits one broadcast; the UI gains a select-mode + sticky bulk bar.

**Tech Stack:** Fastify (server), React 19 + Vite + Tailwind 4 `@theme` tokens (Aurora), vitest, TS NodeNext ESM (`.js` import suffixes).

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `filters-bulk`, tool dir `plugins/jd/tools/project-board`. Run all `npx`/`npm` from the tool dir.

---

### Task 1: Branch

- [ ] **Step 1:** `cd /home/gamesync/source/jd-claude-skill && git checkout main && git pull && git checkout -b filters-bulk`.

---

### Task 2: Pure filter module (TDD)

**Files:** Create `ui/src/filters.ts`; Test: `ui/src/filters.test.ts`.

- [ ] **Step 1: Write the failing test** — create `ui/src/filters.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applyFilters, isShaped, isFilterActive, EMPTY_FILTER } from './filters.js'
import type { BoardItem } from './types.js'

function item(p: Partial<BoardItem>): BoardItem {
  return {
    id: 'TASK-001', type: 'task', title: 't', status: 'backlog', priority: 'P2',
    component: 'cafe-service', created: '2026-06-14', updated: '2026-06-14', body: 'b', ...p,
  }
}

describe('isShaped', () => {
  it('true only when plan has non-whitespace content', () => {
    expect(isShaped(item({ plan: 'real plan' }))).toBe(true)
    expect(isShaped(item({ plan: '   ' }))).toBe(false)
    expect(isShaped(item({ plan: undefined }))).toBe(false)
  })
})

describe('isFilterActive', () => {
  it('false for the empty filter, true once any axis is set', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, component: 'idc-backend' })).toBe(true)
    expect(isFilterActive({ ...EMPTY_FILTER, shaped: 'unshaped' })).toBe(true)
  })
})

describe('applyFilters', () => {
  const items = [
    item({ id: 'A', component: 'cafe-service', type: 'task', priority: 'P0', plan: 'p' }),
    item({ id: 'B', component: 'idc-backend', type: 'bug', priority: 'P2' }),
    item({ id: 'C', component: 'cafe-service', type: 'bug', priority: 'P0', plan: '' }),
  ]
  it('returns all for the empty filter', () => {
    expect(applyFilters(items, EMPTY_FILTER).map((i) => i.id)).toEqual(['A', 'B', 'C'])
  })
  it('filters by component', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, component: 'cafe-service' }).map((i) => i.id)).toEqual(['A', 'C'])
  })
  it('filters by shaped / unshaped', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, shaped: 'shaped' }).map((i) => i.id)).toEqual(['A'])
    expect(applyFilters(items, { ...EMPTY_FILTER, shaped: 'unshaped' }).map((i) => i.id)).toEqual(['B', 'C'])
  })
  it('filters by type and priority, AND-composed', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, type: 'bug', priority: 'P0' }).map((i) => i.id)).toEqual(['C'])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd plugins/jd/tools/project-board && npx vitest run ui/src/filters.test.ts`. Expected: FAIL (`./filters.js` not found).

- [ ] **Step 3: Implement** — create `ui/src/filters.ts`:
```ts
import type { BoardItem, Priority } from './types.js'

export interface BoardFilter {
  component: string // 'all' or a component name
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

- [ ] **Step 4: Run to verify it passes** — `npx vitest run ui/src/filters.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add ui/src/filters.ts ui/src/filters.test.ts
git commit -m "feat(board-ui): pure filter module (applyFilters/isShaped/isFilterActive)"
```

---

### Task 3: Batch endpoint (TDD)

**Files:** Modify `server/src/api/routes.ts`; Test: `server/src/routes.test.ts`.

Context: single-item guards to mirror — `dispatch` allows only `backlog`/`ready` (routes.ts:93); `delete` blocks when a `running`/`queued` job targets the id (routes.ts:155-160); `status === 'ready'` needs a non-empty plan when `requiresShaping` (routes.ts:76-83). `USER_STATUSES` and `PRIORITIES` are already imported in routes.ts. The fake `runner` in `test-helpers.ts` is a real `JobRunner` with a fake `spawnFn`, so `dispatchTask`/`listJobs` work; `git.removeWorktree` is a `vi.fn()`.

- [ ] **Step 1: Write the failing tests** — append to `server/src/routes.test.ts` (uses the top-level `app`/`cookie`/`deps` harness):
```ts
describe('batch actions', () => {
  async function makeTask(title: string): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title, component: 'infra', body: 'detailed description' } })
    return res.json().id as string
  }

  it('400 on empty ids or bad action', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [], action: 'delete' } })).statusCode).toBe(400)
    const id = await makeTask('x')
    expect((await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [id], action: 'nope' } })).statusCode).toBe(400)
  })

  it('400 when status/priority value is missing or invalid', async () => {
    const id = await makeTask('x')
    expect((await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [id], action: 'status', value: 'ai_running' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [id], action: 'priority', value: 'P9' } })).statusCode).toBe(400)
  })

  it('batch priority applies to all and counts results', async () => {
    const a = await makeTask('a'); const b = await makeTask('b')
    const res = await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [a, b, 'TASK-999'], action: 'priority', value: 'P0' } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.applied).toBe(2)
    expect(body.failed).toBe(1)
    expect(body.results.find((r: { id: string }) => r.id === 'TASK-999').ok).toBe(false)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items.find((i: { id: string }) => i.id === a).priority).toBe('P0')
  })

  it('batch status applies the ready-shaping gate per id', async () => {
    const shaped = await makeTask('shaped')
    await app.inject({ method: 'PATCH', url: `/api/tasks/${shaped}`, cookies: cookie,
      payload: { requiresShaping: true, plan: 'a real plan' } })
    const unshaped = await makeTask('unshaped')
    await app.inject({ method: 'PATCH', url: `/api/tasks/${unshaped}`, cookies: cookie,
      payload: { requiresShaping: true } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [shaped, unshaped], action: 'status', value: 'ready' } })
    const body = res.json()
    expect(body.results.find((r: { id: string }) => r.id === shaped).ok).toBe(true)
    expect(body.results.find((r: { id: string }) => r.id === unshaped).ok).toBe(false)
  })

  it('batch dispatch starts jobs for ready items, errors otherwise', async () => {
    const ready = await makeTask('ready')
    await app.inject({ method: 'PATCH', url: `/api/tasks/${ready}`, cookies: cookie, payload: { status: 'ready' } })
    const done = await makeTask('done')
    await app.inject({ method: 'PATCH', url: `/api/tasks/${done}`, cookies: cookie, payload: { status: 'done' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [ready, done], action: 'dispatch' } })
    const body = res.json()
    expect(body.results.find((r: { id: string }) => r.id === ready).ok).toBe(true)
    expect(body.results.find((r: { id: string }) => r.id === done).ok).toBe(false)
    expect(deps.runner.listJobs().some((j) => j.taskId === ready)).toBe(true)
  })

  it('batch delete removes items and calls removeWorktree', async () => {
    const a = await makeTask('a')
    const res = await app.inject({ method: 'POST', url: '/api/tasks/batch', cookies: cookie,
      payload: { ids: [a], action: 'delete' } })
    expect(res.json().applied).toBe(1)
    expect((deps.git.removeWorktree as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(a)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items.find((i: { id: string }) => i.id === a)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/src/routes.test.ts -t "batch actions"`. Expected: FAIL (route 404 → statusCode assertions fail).

- [ ] **Step 3: Implement** — in `server/src/api/routes.ts`, add after the `DELETE /api/tasks/:id` handler (after routes.ts:165). Place the type alias near the top-level `interface PatchBody` (line 15):
```ts
type BatchAction = 'delete' | 'dispatch' | 'status' | 'priority' | 'component'
interface BatchBody { ids?: unknown; action?: unknown; value?: unknown }
```
Handler:
```ts
  app.post<{ Body: BatchBody }>('/api/tasks/batch', (req, reply) => {
    const { ids, action, value } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string' && SAFE_ID.test(x))) {
      return reply.code(400).send({ error: 'ids must be a non-empty array of valid task ids' })
    }
    const ACTIONS: BatchAction[] = ['delete', 'dispatch', 'status', 'priority', 'component']
    if (typeof action !== 'string' || !ACTIONS.includes(action as BatchAction)) {
      return reply.code(400).send({ error: `invalid action: ${String(action)}` })
    }
    if (action === 'status' && !USER_STATUSES.includes(value as ItemStatus)) {
      return reply.code(400).send({ error: `invalid status: ${String(value)}` })
    }
    if (action === 'priority' && !PRIORITIES.includes(value as Priority)) {
      return reply.code(400).send({ error: `invalid priority: ${String(value)}` })
    }
    if (action === 'component' && (typeof value !== 'string' || !value.trim())) {
      return reply.code(400).send({ error: 'component value is required' })
    }

    const results = (ids as string[]).map((id) => {
      const item = store.getItem(id)
      if (!item) return { id, ok: false, error: 'not found' }
      try {
        switch (action) {
          case 'delete': {
            const liveJob = deps.runner.listJobs().some(
              (j) => (j.state === 'running' || j.state === 'queued') && j.taskId === id)
            if (liveJob) return { id, ok: false, error: 'a job is running; cancel it first' }
            store.deleteItem(id)
            try { deps.git.removeWorktree(id) } catch { /* best-effort */ }
            return { id, ok: true }
          }
          case 'dispatch': {
            if (!['backlog', 'ready'].includes(item.status)) {
              return { id, ok: false, error: `cannot dispatch a task in '${item.status}'` }
            }
            deps.runner.dispatchTask(id)
            return { id, ok: true }
          }
          case 'status': {
            if (value === 'ready' && item.requiresShaping && !item.plan?.trim()) {
              return { id, ok: false, error: 'cần brainstorm + plan trước khi sang Ready' }
            }
            store.updateItem(id, { status: value as ItemStatus })
            return { id, ok: true }
          }
          case 'priority':
            store.updateItem(id, { priority: value as Priority })
            return { id, ok: true }
          case 'component':
            store.updateItem(id, { component: (value as string).trim() })
            return { id, ok: true }
        }
      } catch (err) {
        return { id, ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })

    const applied = results.filter((r) => r.ok).length
    if (applied > 0) hub.broadcast({ type: 'board_update' })
    return reply.send({ applied, failed: results.length - applied, results })
  })
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run server/src/routes.test.ts` (full file) green; then `npm run typecheck` clean.

- [ ] **Step 5: Commit.**
```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): POST /api/tasks/batch (delete/dispatch/status/priority/component, per-id results)"
```

---

### Task 4: api client method

**Files:** Modify `ui/src/api.ts`.

- [ ] **Step 1: Implement** — add inside the `api` object (after the `dispatch` entry, ui/src/api.ts:25). Match the existing `request<T>(url, init)` style:
```ts
  batch: (ids: string[], action: string, value?: string) =>
    request<{ applied: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>(
      '/api/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, action, value }) }),
```

- [ ] **Step 2: Verify** — `npm run typecheck` clean.

- [ ] **Step 3: Commit.**
```bash
git add ui/src/api.ts
git commit -m "feat(board-ui): api.batch client for /api/tasks/batch"
```

---

### Task 5: FilterBar component + App wiring

**Files:** Create `ui/src/components/FilterBar.tsx`; Modify `ui/src/App.tsx`.

Context: `App` (ui/src/App.tsx) renders `<Kanban items={snapshot.items} onSelect={setSelected} />` at line 50, inside the `<div className="flex min-h-0 flex-1 gap-3">` row. `snapshot.components` is `ComponentStatus[]` each with a `.component` string. Reuse the select token classes from QuickAdd: `rounded-md border border-border bg-sunken px-2 py-2 text-text-primary`.

- [ ] **Step 1: Create `ui/src/components/FilterBar.tsx`:**
```tsx
import type { BoardFilter } from '../filters.js'
import { isFilterActive, EMPTY_FILTER } from '../filters.js'
import type { Priority } from '../types.js'

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

export function FilterBar(
  { components, filter, onChange }:
  { components: string[]; filter: BoardFilter; onChange: (f: BoardFilter) => void },
) {
  const sel = 'rounded-md border border-border bg-sunken px-2 py-1.5 text-sm text-text-primary'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={filter.component} onChange={(e) => onChange({ ...filter, component: e.target.value })}>
        <option value="all">Service: tất cả</option>
        {components.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={sel} value={filter.shaped} onChange={(e) => onChange({ ...filter, shaped: e.target.value as BoardFilter['shaped'] })}>
        <option value="all">Nắn: tất cả</option>
        <option value="shaped">Đã nắn</option>
        <option value="unshaped">Chưa nắn</option>
      </select>
      <select className={sel} value={filter.type} onChange={(e) => onChange({ ...filter, type: e.target.value as BoardFilter['type'] })}>
        <option value="all">Loại: tất cả</option>
        <option value="task">task</option>
        <option value="bug">bug</option>
      </select>
      <select className={sel} value={filter.priority} onChange={(e) => onChange({ ...filter, priority: e.target.value as BoardFilter['priority'] })}>
        <option value="all">Ưu tiên: tất cả</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {isFilterActive(filter) && (
        <button onClick={() => onChange(EMPTY_FILTER)}
          className="rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">
          Xóa lọc
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `App.tsx`.** Add imports near the other component imports (after line 11):
```ts
import { FilterBar } from './components/FilterBar.js'
import { applyFilters, EMPTY_FILTER, type BoardFilter } from './filters.js'
```
Add filter state with the other `useState` hooks (after line 18 `const [consoleJob, ...]`):
```ts
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER)
```
Replace the board row (App.tsx:48-51, the `<div className="flex min-h-0 flex-1 gap-3">` block containing ComponentsPanel/Kanban/ActivityPanel) with a wrapper that adds the filter bar above Kanban and passes filtered items:
```tsx
      <div className="flex min-h-0 flex-1 gap-3">
        <ComponentsPanel components={snapshot.components} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FilterBar components={snapshot.components.map((c) => c.component)} filter={filter} onChange={setFilter} />
          <Kanban items={applyFilters(snapshot.items, filter)} onSelect={setSelected} />
        </div>
        <ActivityPanel jobs={snapshot.jobs} previews={previews} onOpenConsole={setConsoleJob} />
      </div>
```
(Kanban already has `flex min-w-0 flex-1 flex-col` internally; nesting it under this wrapper is fine — the wrapper owns the flex-1 width now and Kanban fills it.)

- [ ] **Step 3: Verify** — `npm run typecheck` clean; `npx vite build ui` ok.

- [ ] **Step 4: grep-gate** — run the repo's tokens-only gate (the same one used in prior board commits, e.g. `bash plugins/jd/tools/project-board/scripts/grep-gate.sh` if present, otherwise the documented grep for raw hex in `ui/src`). Confirm no new raw hex/arbitrary colors were introduced in FilterBar.tsx. Expected: clean.

- [ ] **Step 5: Commit.**
```bash
git add ui/src/components/FilterBar.tsx ui/src/App.tsx
git commit -m "feat(board-ui): filter bar (Service / nắn / loại / ưu tiên) above Kanban"
```

---

### Task 6: Selection + bulk bar

**Files:** Create `ui/src/components/BulkBar.tsx`; Modify `ui/src/components/Kanban.tsx`, `ui/src/App.tsx`.

Context: bulk actions call `api.batch(ids, action, value)` (Task 4). Selection lives in `App` so the bulk bar and Kanban share it; changing `filter` must clear it (spec). Kanban renders cards at Kanban.tsx:76-101; the card root `<div key={item.id} ...>` has an `onClick={() => onSelect(item.id)}`.

- [ ] **Step 1: Create `ui/src/components/BulkBar.tsx`:**
```tsx
import { useState } from 'react'
import { api } from '../api.js'
import type { ItemStatus, Priority } from '../types.js'

const STATUSES: ItemStatus[] = ['backlog', 'ready', 'review', 'done']
const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

export function BulkBar(
  { ids, onClear, onDone }:
  { ids: string[]; onClear: () => void; onDone: (failedIds: string[]) => void },
) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(action: string, value?: string) {
    setBusy(true); setMsg('')
    try {
      const r = await api.batch(ids, action, value)
      const failed = r.results.filter((x) => !x.ok)
      setMsg(`${r.applied} ok${r.failed ? ` · ${r.failed} lỗi` : ''}`)
      onDone(failed.map((x) => x.id))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'lỗi')
    } finally { setBusy(false) }
  }

  const btn = 'rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2">
      <span className="text-sm font-semibold text-text-primary">Đã chọn {ids.length}</span>
      <button disabled={busy} className={btn} onClick={() => void run('dispatch')}>Dispatch</button>
      <select disabled={busy} className={btn} defaultValue="" onChange={(e) => { if (e.target.value) void run('status', e.target.value); e.target.value = '' }}>
        <option value="">Chuyển trạng thái…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select disabled={busy} className={btn} defaultValue="" onChange={(e) => { if (e.target.value) void run('priority', e.target.value); e.target.value = '' }}>
        <option value="">Ưu tiên…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button disabled={busy}
        className="rounded-md border border-danger-border bg-danger-bg px-2 py-1.5 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50"
        onClick={() => { if (confirm(`Xóa ${ids.length} mục? Sẽ dọn worktree/branch của từng task.`)) void run('delete') }}>
        Xóa
      </button>
      <button disabled={busy} className={btn} onClick={onClear}>Bỏ chọn</button>
      {msg && <span className="text-sm text-text-muted">{msg}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Add selection support to `Kanban.tsx`.** Extend the props and render a checkbox when `selectMode`. Change the signature (Kanban.tsx:45):
```tsx
export function Kanban(
  { items, onSelect, selectMode, selected, onToggle }:
  { items: BoardItem[]; onSelect: (id: string) => void; selectMode: boolean;
    selected: Set<string>; onToggle: (id: string) => void },
) {
```
Inside the card `<div key={item.id} ...>` (Kanban.tsx:76), add a checkbox as the first child of the card, and guard the card click so toggling selection doesn't open the drawer. Replace the card's `onClick={() => onSelect(item.id)}` with:
```tsx
                onClick={() => { if (selectMode) onToggle(item.id); else onSelect(item.id) }}
```
And insert, immediately inside the card before the `<div className="flex items-center justify-between text-xs">`:
```tsx
                {selectMode && (
                  <input type="checkbox" checked={selected.has(item.id)} readOnly
                    className="mb-1 accent-accent" onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggle(item.id)} />
                )}
```

- [ ] **Step 3: Wire selection state into `App.tsx`.**

NAME-CLASH WARNING: the existing `selected`/`setSelected` state (App.tsx:18) is the drawer-open id (`string | null`) — leave it untouched. The new bulk selection is a separate `Set<string>` named **`bulkSelected`/`setBulkSelected`**. Kanban's existing `onSelect` prop still opens the drawer (`onSelect={setSelected}`); the new `selected`/`onToggle` props carry `bulkSelected`.

Add state (after the `filter` state from Task 5):
```ts
  const [selectMode, setSelectMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
```
Add the import near the other component imports:
```ts
import { BulkBar } from './components/BulkBar.js'
```
Replace the Kanban wrapper block from Task 5 with the full version below (filter bar clears the bulk selection on change; select-mode toggle; select-all-filtered; bulk bar; Kanban gets both the drawer `onSelect` and the bulk props):
```tsx
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar components={snapshot.components.map((c) => c.component)} filter={filter}
              onChange={(f) => { setFilter(f); setBulkSelected(new Set()) }} />
            <button onClick={() => { setSelectMode((v) => !v); setBulkSelected(new Set()) }}
              className="rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">
              {selectMode ? 'Xong' : 'Chọn'}
            </button>
            {selectMode && (
              <button onClick={() => setBulkSelected(new Set(applyFilters(snapshot.items, filter).map((i) => i.id)))}
                className="rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">
                Chọn tất cả (đang lọc)
              </button>
            )}
          </div>
          {selectMode && bulkSelected.size > 0 && (
            <BulkBar ids={[...bulkSelected]} onClear={() => setBulkSelected(new Set())}
              onDone={(failedIds) => { setBulkSelected(new Set(failedIds)); void refresh() }} />
          )}
          <Kanban items={applyFilters(snapshot.items, filter)} onSelect={setSelected}
            selectMode={selectMode} selected={bulkSelected}
            onToggle={(id) => setBulkSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })} />
        </div>
```

- [ ] **Step 4: Verify** — `npm run typecheck` clean; `npx vite build ui` ok; `npx vitest run` (full suite, incl. filters + routes) green; grep-gate clean.

- [ ] **Step 5: Commit.**
```bash
git add ui/src/components/BulkBar.tsx ui/src/components/Kanban.tsx ui/src/App.tsx
git commit -m "feat(board-ui): select mode + bulk action bar (dispatch/status/priority/delete)"
```

---

### Task 7: Deploy

- [ ] **Step 1: Final gates.** From the tool dir: `npm run typecheck && npx vite build ui && npx vitest run` all green; grep-gate clean.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` `0.30.1` → `0.31.0`; commit `chore(jd): bump plugin to 0.31.0 (board filters + bulk actions)`. Then `git checkout main && git merge --no-ff filters-bulk -m "Merge filters-bulk: board filters + bulk actions" && git branch -d filters-bulk && git push origin main`.
- [ ] **Step 3: Build + restart — ONLY when no board jobs are running.** Check `ps aux | grep '[c]laude -p'` (no rescan/task job) AND `/api/jobs` shows no active jobs. Then from the tool dir `npm run build`, stop the running `node dist/server/src/index.js`, and relaunch with the SAME env (`BOARD_HOST=0.0.0.0 BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400`) via nohup, appending to `/home/gamesync/source/gamesync/project-board/board.log`.
- [ ] **Step 4: Verify** — `curl -s http://127.0.0.1:4400/api/board >/dev/null` responds; open the board, confirm filters narrow the Kanban and the bulk bar appears when items are selected.

---

## Self-review notes
- **Spec coverage:** filters module + bar (T2, T5: Service/nắn/loại/ưu tiên, AND-composed, Xóa lọc, isFilterActive); shaped = `plan?.trim()` binary (T2 `isShaped`); batch endpoint with all 5 actions + per-id results + single broadcast + validation (T3); reuses single-route guards (T3 mirrors routes.ts:76-83/93/155-160); api.batch (T4); selection Set + bulk bar + select-all-filtered + clear-on-filter-change + partial-failure keeps failed selected (T6); tokens-only + grep-gate (T5/T6); deploy (T7).
- **Type consistency:** `BoardFilter`/`EMPTY_FILTER`/`isShaped`/`isFilterActive`/`applyFilters` defined in T2, consumed identically in T5/T6. `BatchAction` and the `{applied,failed,results:[{id,ok,error?}]}` shape defined in T3 match `api.batch`'s return type in T4 and `BulkBar`'s usage in T6. `USER_STATUSES`/`PRIORITIES`/`SAFE_ID`/`ItemStatus`/`Priority` already imported in routes.ts.
- **Name-clash guard:** T6 calls out the existing `selected`/`setSelected` (drawer-open `string|null`, App.tsx:18) vs the new bulk-selection `Set<string>` — resolved by naming the new state `bulkSelected`/`setBulkSelected`. The drawer-open prop stays `onSelect={setSelected}`.
- **Out of scope (YAGNI):** no filter persistence, no bulk merge/PR/resolve, no drag-multi, no saved presets.
