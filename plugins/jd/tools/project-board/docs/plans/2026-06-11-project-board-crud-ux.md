# Project Board CRUD + UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full task/bug CRUD, mandatory descriptions, an editable click-outside-to-close detail panel, a visible Execute action, distinct task/bug + status card colors, and an AI-activity cleanup button — per spec `docs/superpowers/specs/2026-06-11-project-board-crud-ux-design.md`. Layout unchanged.

**Architecture:** Server gets `store.deleteItem`, `runner.clearFinished`, a DELETE task route, a relaxed dispatch guard, a required-description check on create, and a clear-finished route. UI gets a description field on create, an editable TaskDrawer with a backdrop, type/status-encoded cards, and a "Dọn xong" button. Tokens-only styling per `DESIGN_SYSTEM.md`.

**Tech Stack:** existing Fastify/React/Aurora stack; no new deps.

**Repo:** ALL work in `/home/gamesync/source/jd-claude-skill` on a new branch `crud-ux`, tool dir `plugins/jd/tools/project-board`. Paths below are relative to the tool dir. `DESIGN_SYSTEM.md` + the spec are authoritative.

---

## File structure

```
server/src/store.ts              # + deleteItem(id)
server/src/jobs/runner.ts        # + clearFinished(): number
server/src/api/routes.ts         # require body on create; relax dispatch; + DELETE task; + clear-finished
server/src/store.test.ts         # + deleteItem tests
server/src/runner.test.ts        # + clearFinished test
server/src/routes.test.ts        # + delete/dispatch/clear-finished tests; ADD body to all create payloads
ui/src/index.css                 # + task/bug surface tokens
ui/src/api.ts                    # + deleteTask, clearFinishedJobs
ui/src/components/QuickAdd.tsx   # + required Description textarea
ui/src/components/Kanban.tsx     # type tint + badge + status pill (+ existing edge)
ui/src/components/TaskDrawer.tsx # edit form + backdrop + Execute + Delete-confirm
ui/src/components/ActivityPanel.tsx # "Dọn xong" button
ui/src/App.tsx                   # pass components to TaskDrawer
DESIGN_SYSTEM.md                 # card type/status recipe, panel form, confirm dialog
```

---

### Task 1: store.deleteItem + runner.clearFinished (TDD)

**Files:**
- Modify: `server/src/store.ts`, `server/src/jobs/runner.ts`
- Test: `server/src/store.test.ts`, `server/src/runner.test.ts`

- [ ] **Step 1: Failing store test.** Append to `server/src/store.test.ts`:

```ts
  it('deletes an item file', () => {
    const a = store.createItem({ type: 'task', title: 'Doomed', component: 'infra' })
    expect(store.getItem(a.id)).toBeDefined()
    store.deleteItem(a.id)
    expect(store.getItem(a.id)).toBeUndefined()
    expect(store.scan().items).toHaveLength(0)
  })

  it('throws when deleting an unknown item', () => {
    expect(() => store.deleteItem('TASK-999')).toThrow(/not found/)
  })
```

- [ ] **Step 2:** Run `cd plugins/jd/tools/project-board && npx vitest run server/src/store.test.ts` — FAIL (deleteItem missing).

- [ ] **Step 3: Implement.** In `store.ts` add `unlinkSync` to the `node:fs` import, and add the method (next to `updateItem`):

```ts
  deleteItem(id: string): void {
    const file = this.fileFor(id)
    if (!file) throw new Error(`item not found: ${id}`)
    unlinkSync(file)
  }
```

- [ ] **Step 4:** Tests pass.

- [ ] **Step 5: Failing runner test.** Append to `server/src/runner.test.ts` (uses the existing `setup()` harness):

```ts
  it('clearFinished removes finished jobs + files, keeps active ones', async () => {
    const t = setup()
    // job 1: succeeds
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const done = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(done.id)?.state).toBe('succeeded'))
    // job 2: a second task, still running
    const other = t.store.createItem({ type: 'task', title: 'Running', component: 'infra' })
    t.store.updateItem(other.id, { status: 'ready' })
    const live = t.runner.dispatchTask(other.id)
    expect(t.runner.getJob(live.id)?.state).toBe('running')

    const cleared = t.runner.clearFinished()
    expect(cleared).toBe(1)
    expect(t.runner.getJob(done.id)).toBeUndefined()
    expect(t.runner.getJob(live.id)).toBeDefined()
    expect(existsSync(path.join(t.dataDir, 'jobs', `${done.id}.json`))).toBe(false)
  })
```

Add `import { existsSync } from 'node:fs'` to the test file if not present.

- [ ] **Step 6:** Run — FAIL (clearFinished missing).

- [ ] **Step 7: Implement.** In `runner.ts` add `unlinkSync` to the `node:fs` import, and add the public method (next to `listJobs`):

```ts
  clearFinished(): number {
    const finished: Job['state'][] = ['succeeded', 'failed', 'cancelled', 'interrupted']
    let cleared = 0
    for (const [id, job] of this.jobs) {
      if (!finished.includes(job.state)) continue
      this.jobs.delete(id)
      if (this.deps) {
        for (const ext of ['.json', '.log']) {
          try { unlinkSync(path.join(this.deps.jobsDir, `${id}${ext}`)) } catch { /* file may not exist */ }
        }
      }
      cleared++
    }
    return cleared
  }
```

- [ ] **Step 8:** Full suite + `npm run typecheck` green. Commit:

```bash
git add server/src/store.ts server/src/jobs/runner.ts server/src/store.test.ts server/src/runner.test.ts
git commit -m "feat(board): store.deleteItem and runner.clearFinished"
```

---

### Task 2: Routes — require description, DELETE task, relax dispatch, clear-finished (TDD)

**Files:**
- Modify: `server/src/api/routes.ts`
- Modify: `server/src/routes.test.ts` (new tests + add `body` to ALL existing create payloads)

- [ ] **Step 1: Repair existing create payloads first.** In `server/src/routes.test.ts`, EVERY `POST /api/tasks` injection currently sends `payload: { type, title, component }` with no `body`. Add `body: 'detailed description'` to each (search the file for `url: '/api/tasks'` with `method: 'POST'`; there are several across the task/job/review/console describe blocks). This is required because Step 3 makes `body` mandatory — without it those pre-existing tests would 400 for the wrong reason.

- [ ] **Step 2: Failing new tests.** Append to `routes.test.ts`:

```ts
describe('crud + lifecycle', () => {
  async function makeTask(status?: string): Promise<string> {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detail' } })
    if (status) await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status } })
    return 'TASK-001'
  }

  it('rejects create without a description', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'No desc', component: 'infra' } })
    expect(res.statusCode).toBe(400)
  })

  it('deletes a task', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items).toHaveLength(0)
  })

  it('404s deleting an unknown task and 409s while a job runs', async () => {
    const unknown = await app.inject({ method: 'DELETE', url: '/api/tasks/TASK-999', cookies: cookie })
    expect(unknown.statusCode).toBe(404)
    const id = await makeTask('ready')
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })  // -> ai_running
    const busy = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}`, cookies: cookie })
    expect(busy.statusCode).toBe(409)
  })

  it('dispatches from backlog (not just ready)', async () => {
    const id = await makeTask()  // status backlog
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })
    expect(res.statusCode).toBe(202)
  })

  it('refuses dispatch from review/done', async () => {
    const id = await makeTask('review')
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('clears finished jobs', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs/clear-finished', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('cleared')
  })
})
```

- [ ] **Step 3:** Run `npx vitest run server/src/routes.test.ts` — new tests FAIL.

- [ ] **Step 4: Require body on create.** In `routes.ts`, the `POST /api/tasks` handler validation — change the guard to also require `body`:

```ts
    const { type, title, component, priority, body } = req.body ?? {}
    if (!type || !['task', 'bug'].includes(type) || !title?.trim() || !component?.trim() || !body?.trim()) {
      return reply.code(400).send({ error: 'type, title, component and description are required' })
    }
```

(The rest of the handler — priority validation, `store.createItem`, broadcast, 201 — stays.)

- [ ] **Step 5: Relax dispatch.** In the `POST /api/tasks/:id/dispatch` handler, change the status guard:

```ts
    if (!['backlog', 'ready', 'failed'].includes(item.status)) {
      return reply.code(409).send({ error: `cannot dispatch a task in '${item.status}'` })
    }
```

- [ ] **Step 6: Add DELETE + clear-finished routes.** Append inside `registerRoutes`:

```ts
  app.delete<{ Params: { id: string } }>('/api/tasks/:id', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status === 'ai_running') {
      return reply.code(409).send({ error: 'a job is running on this task; cancel it first' })
    }
    store.deleteItem(item.id)
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
  })

  app.post('/api/jobs/clear-finished', (_req, reply) => {
    const cleared = deps.runner.clearFinished()
    hub.broadcast({ type: 'board_update' })
    return reply.send({ cleared })
  })
```

- [ ] **Step 7:** Full suite + typecheck green. Commit:

```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): require description; DELETE task; relax dispatch; clear-finished route"
```

---

### Task 3: Tokens + create form + card colors

**Files:**
- Modify: `ui/src/index.css`, `ui/src/api.ts`, `ui/src/components/QuickAdd.tsx`, `ui/src/components/Kanban.tsx`

- [ ] **Step 1: Tokens.** In `ui/src/index.css`, inside the `@theme` block (after the status tokens), add:

```css
  --color-task-bg: #0e1b2b;
  --color-task-border: #1e3a52;
  --color-bug-bg: #241318;
  --color-bug-border: #4a2230;
```

- [ ] **Step 2: api.** In `ui/src/api.ts` add to the `api` object:

```ts
  deleteTask: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  clearFinishedJobs: () => request<{ cleared: number }>('/api/jobs/clear-finished', { method: 'POST' }),
```

- [ ] **Step 3: QuickAdd description.** Replace `ui/src/components/QuickAdd.tsx` with:

```tsx
import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function QuickAdd({ components, onClose }: { components: ComponentStatus[]; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'task' | 'bug'>('task')
  const [component, setComponent] = useState(components[0]?.component ?? 'infra')
  const [error, setError] = useState('')

  const valid = title.trim() && description.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      await api.createTask({ type, title: title.trim(), component, body: description.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-[28rem] space-y-3 rounded-xl border border-border-strong bg-surface p-5">
        <h2 className="font-semibold text-text-primary">Thêm mục mới</h2>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="w-full rounded-md border border-border bg-sunken px-3 py-2 text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
          placeholder="Mô tả chi tiết (AI dựa vào đây để làm — bắt buộc)"
          className="w-full resize-none rounded-md border border-border bg-sunken px-3 py-2 text-[14px] leading-[1.65] text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'task' | 'bug')}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            <option value="task">Task</option>
            <option value="bug">Bug</option>
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={!valid}
          className="w-full rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Tạo</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Card colors.** In `ui/src/components/Kanban.tsx`, add maps near `PRIORITY_COLOR` and apply them to the card. Add:

```tsx
const TYPE_CARD: Record<string, string> = {
  task: 'bg-task-bg border-task-border',
  bug: 'bg-bug-bg border-bug-border',
}
const TYPE_BADGE: Record<string, string> = {
  task: 'text-accent', bug: 'text-danger',
}
const STATUS_PILL: Record<ItemStatus, string> = {
  backlog: 'text-text-secondary border-border',
  ready: 'text-ready border-ready-border',
  ai_running: 'text-running border-running-border',
  review: 'text-ok border-ok-border',
  done: 'text-ok border-ok-border',
}
```

Replace the card JSX (the inner `items.filter(...).map((item) => ...)` element) with:

```tsx
            {items.filter((i) => i.status === col.key).map((item) => (
              <div key={item.id} draggable={item.status !== 'ai_running'}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                onClick={() => onSelect(item.id)}
                className={`cursor-pointer rounded-lg border border-l-2 p-2 text-sm transition-colors duration-150 hover:border-y-border-strong hover:border-r-border-strong ${TYPE_CARD[item.type]} ${STATUS_EDGE[item.status]}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-muted">{item.id}</span>
                  <span className={`font-mono ${PRIORITY_COLOR[item.priority]}`}>{item.priority}</span>
                </div>
                <div className={`mt-0.5 ${item.type === 'bug' ? 'text-danger' : 'text-text-primary'}`}>{item.title}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-text-muted">{item.component}</span>
                  <span className="flex gap-1">
                    <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${TYPE_BADGE[item.type]} border-current`}>{item.type}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${STATUS_PILL[item.status]}`}>{col.label}</span>
                  </span>
                </div>
              </div>
            ))}
```

Keep the existing `STATUS_EDGE` map (the left-border colors); it stays the source of the `border-l` color. `border-current` on the type badge uses the badge text color for its ring. The `hover:border-y/-r-border-strong` (not all-sides) preserves the status left edge on hover — same fix already applied earlier.

- [ ] **Step 5:** `npm run typecheck && npx vite build ui && npx vitest run` green; grep-gate (`grep -rnE '(zinc|cyan|red|green|orange|rose|amber)-[0-9]' ui/src` → nothing). Commit:

```bash
git add ui/src/index.css ui/src/api.ts ui/src/components/QuickAdd.tsx ui/src/components/Kanban.tsx
git commit -m "feat(board-ui): required description, task/bug + status card colors"
```

---

### Task 4: TaskDrawer edit form + Delete; ActivityPanel cleanup; DS update

**Files:**
- Modify: `ui/src/components/TaskDrawer.tsx`, `ui/src/components/ActivityPanel.tsx`, `ui/src/App.tsx`, `DESIGN_SYSTEM.md`

- [ ] **Step 1: Rewrite TaskDrawer.** Replace `ui/src/components/TaskDrawer.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem, ComponentStatus, Priority } from '../types.js'
import { DiffView } from './DiffView.js'

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']
const CAN_EXECUTE = ['backlog', 'ready', 'failed']

export function TaskDrawer({ item, components, onClose, onOpenConsole }: {
  item: BoardItem
  components: ComponentStatus[]
  onClose: () => void
  onOpenConsole?: (jobId: string) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.body.trim())
  const [priority, setPriority] = useState<Priority>(item.priority)
  const [component, setComponent] = useState(item.component)
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTitle(item.title); setDescription(item.body.trim()); setPriority(item.priority)
    setComponent(item.component); setConfirmDelete(false); setError('')
  }, [item.id]) // seed only on item change, not on every board refresh

  useEffect(() => {
    setDiff(null)
    if (item.status !== 'review') return
    let cancelled = false
    api.diff(item.id).then((d) => { if (!cancelled) setDiff(d) }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [item.id, item.status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = title !== item.title || description !== item.body.trim() || priority !== item.priority || component !== item.component
  const canSave = dirty && title.trim() && description.trim()

  async function act(fn: () => Promise<unknown>, close = true) {
    setBusy(true); setError('')
    try { await fn(); if (close) onClose() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-10 bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-[34rem] flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-text-muted">{item.id} · {item.status}</div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="rounded-md border border-border bg-sunken px-3 py-2 text-lg font-semibold text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8}
          placeholder="Mô tả chi tiết (bắt buộc)"
          className="resize-none rounded-md border border-border bg-sunken px-3 py-2 text-[14px] leading-[1.65] text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <div className="flex gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>

        <button disabled={!canSave || busy}
          onClick={() => void act(() => api.patchTask(item.id, { title: title.trim(), body: description.trim(), priority, component }), false)}
          className="rounded-md border border-border py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-raised hover:border-border-strong disabled:opacity-40">
          {dirty ? 'Lưu thay đổi' : 'Đã lưu'}
        </button>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="border-t border-border pt-3">
          {CAN_EXECUTE.includes(item.status) && (
            <button disabled={busy} onClick={() => void act(() => api.dispatch(item.id), false)}
              className="w-full rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-semibold text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
              ⚡ Giao cho AI
            </button>
          )}
          {item.job && onOpenConsole && (
            <button onClick={() => onOpenConsole(item.job!)}
              className="mt-2 w-full rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">Mở console</button>
          )}
          {item.status === 'review' && (
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => void act(() => api.merge(item.id))}
                className="flex-1 rounded-md border border-ok-border bg-ok-bg py-2 text-sm font-medium text-ok transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Merge</button>
              <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
                className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50">Tạo PR</button>
              <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
                className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Hủy bỏ</button>
            </div>
          )}
        </div>

        {diff !== null && (
          <>
            <h3 className="text-xs font-semibold uppercase text-text-muted">Diff (main…board/{item.id})</h3>
            <DiffView diff={diff} />
          </>
        )}

        <div className="mt-auto border-t border-border pt-3">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm text-danger">Xóa {item.id}? Không hoàn tác được.</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => void act(() => api.deleteTask(item.id))}
                  className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Xóa hẳn</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">Thôi</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-sm text-text-muted transition-colors duration-150 hover:text-danger">Xóa mục này</button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: App passes components.** In `ui/src/App.tsx`, find the `<TaskDrawer ... />` render and add `components={snapshot.components}`:

```tsx
      {selected && snapshot.items.find((i) => i.id === selected) && (
        <TaskDrawer item={snapshot.items.find((i) => i.id === selected)!} components={snapshot.components}
          onClose={() => setSelected(null)} onOpenConsole={setConsoleJob} />
      )}
```

(If the current render doesn't already pass `onOpenConsole`, add it. The App-level ESC handler for the console overlay stays; TaskDrawer now owns its own ESC.)

- [ ] **Step 3: ActivityPanel "Dọn xong".** In `ui/src/components/ActivityPanel.tsx`, change the header row to include a clear button:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase text-text-muted">Hoạt động AI</h2>
        <button onClick={() => void api.clearFinishedJobs()}
          className="rounded bg-raised px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:brightness-110">Dọn xong</button>
      </div>
```

(Import `api` if not already imported. Keep the jobs list and RescanReview unchanged.)

- [ ] **Step 4: DESIGN_SYSTEM.** Update `DESIGN_SYSTEM.md`:
  - Edit the **Kanban card** recipe: "Type → tinted surface (`bg-task-bg`/`bg-bug-bg`) + a mono TASK/BUG badge (accent/danger). Status → 2px left edge in the status color + a status pill. Both signals coexist." Add the two type tokens to the color table.
  - Edit the **Drawer** recipe to: editable form (title/description/priority/component) with a Save button (enabled only when dirty + both required fields non-blank); full-screen backdrop + outside-click + ESC close; action row Execute (backlog/ready/failed) / Mở console / review actions; a Delete affordance at the bottom with an inline confirm (danger).
  - Add a **Confirm (inline/dialog)** note: danger-tinted confirm button + neutral cancel, shown in place rather than a separate modal where practical.

- [ ] **Step 5:** `npm run typecheck && npx vite build ui && npx vitest run` green; grep-gate clean. Commit:

```bash
git add ui/src/components/TaskDrawer.tsx ui/src/components/ActivityPanel.tsx ui/src/App.tsx DESIGN_SYSTEM.md
git commit -m "feat(board-ui): editable detail panel with backdrop, execute, delete; activity cleanup"
```

---

### Task 5: e2e, version, deploy

- [ ] **Step 1: e2e (throwaway clone)** — same harness as prior e2es (clone to a tmp git repo on branch `main`, `project-board/data/{tasks,status,jobs}`, copy node_modules, build, stub-claude emitting stream-json + `--resume`, start server on 127.0.0.1:4488 with `BOARD_CLAUDE_BIN=<stub>`). Flow via curl:
  1. login → `POST /api/tasks` WITH `body` → 201 TASK-001
  2. `POST /api/tasks` without `body` → 400
  3. `PATCH /api/tasks/TASK-001` `{title:'edited', body:'edited desc', priority:'P1'}` → 200; GET board shows the edits
  4. `POST /api/tasks/TASK-001/dispatch` (from backlog) → 202; poll to succeeded + review
  5. create TASK-002 (with body) → `DELETE /api/tasks/TASK-002` → 200; board no longer lists it
  6. `POST /api/jobs/clear-finished` → 200 `{cleared: ≥1}`; GET board jobs no longer includes the cleared job
  7. GET `/` → 200 HTML (cache-control no-cache, from the earlier fix)
  Kill server, rm tmp. Record outputs.

- [ ] **Step 2:** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.14.0`. Commit `chore(jd): bump plugin to 0.14.0 (crud + ux batch)`.

- [ ] **Step 3:** Merge `crud-ux` → `main`, push origin.

- [ ] **Step 4:** Restart the gamesync board (kill :4400, reuse the existing password `07d8524bdf7279b6` if still set, else regenerate; start per the skill's run command). Verify login + the new bundle hash is served. Report URL + password and remind the owner to hard-refresh once (new JS bundle).

---

## Self-review notes

- Spec coverage: require description (T2 route + T3 QuickAdd), edit form + backdrop + ESC (T4), delete with confirm + 409-while-running (T1 store, T2 route, T4 UI), Execute in panel for backlog/ready/failed (T2 route relax, T4 button), task/bug colors + status pill/edge (T3), AI cleanup (T1 runner, T2 route, T4 button), layout unchanged (no layout task), DS updates (T4).
- The require-body change ripples into existing route tests — T2 Step 1 explicitly repairs every create payload first, so the suite stays green for the right reasons.
- Type consistency: `store.deleteItem(id)`, `runner.clearFinished(): number`, `api.deleteTask`/`api.clearFinishedJobs`, `TaskDrawer` gains `components` + `onOpenConsole` props (App passes both). `CAN_EXECUTE`/status maps use the canonical `ItemStatus` values.
- Card hover uses `border-y/-r-border-strong` (not all-sides) to preserve the status left edge on hover — the fix established in the Aurora work.
- DiffView already exists (job-console work) — TaskDrawer imports it instead of a raw `<pre>`.
