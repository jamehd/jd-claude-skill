# Auto-Dispatch (Phase C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When auto-dispatch is on and the runner is idle, automatically dispatch the highest-priority `ready` task (stopping at `review`), with a persisted on/off + `maxAuto` cap and a consecutive-failure pause — per spec `docs/specs/2026-06-12-auto-dispatch-design.md`.

**Architecture:** Add an `auto` state + `autoTick()` to the JobRunner; tick on enable, on every job's terminal finish, and on an 8s interval. Counters live in memory (reset on boot); `enabled`/`maxAuto`/`failureThreshold` persist to `data/auto.json`. Two routes (`GET`/`POST /api/auto`) and an `AutoControl` header component drive it.

**Tech Stack:** existing Fastify/React/Aurora/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `auto-dispatch`, tool dir `plugins/jd/tools/project-board`. Paths relative to the tool dir.

---

## File structure

```
ui/src/types.ts                       # AutoState interface
server/src/jobs/runner.ts             # auto state, setAuto/getAuto, autoTick, persist, hooks, shuttingDown guard
server/src/runner.test.ts             # auto-dispatch tests
server/src/api/routes.ts              # GET/POST /api/auto
server/src/routes.test.ts             # auto route tests
ui/src/api.ts                         # getAuto, setAuto
ui/src/components/AutoControl.tsx      # NEW header control
ui/src/App.tsx                        # mount AutoControl
```

---

### Task 1: Runner auto-dispatch engine (TDD)

**Files:**
- Modify: `ui/src/types.ts`, `server/src/jobs/runner.ts`
- Test: `server/src/runner.test.ts`

- [ ] **Step 1: Branch + AutoState type.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b auto-dispatch`. Add to `ui/src/types.ts`:

```ts
export interface AutoState {
  enabled: boolean
  paused: boolean
  pauseReason?: string
  maxAuto: number
  dispatched: number
  consecutiveFailures: number
  maxConcurrent: number
}
```

- [ ] **Step 2: Failing tests** — append to `server/src/runner.test.ts` (uses the existing `setup()` harness: `store`, `runner`, `procs`, `sendInit`, `dataDir`; tasks created via `store.createItem` + `store.updateItem`). Note `setup()`'s `maxConcurrent` is 5000ms timeout / concurrency 1 — confirm by reading; these tests assume concurrency 1 (the default):

```ts
describe('auto-dispatch', () => {
  function ready(t: ReturnType<typeof setup>, title: string, priority: 'P0'|'P1'|'P2'|'P3' = 'P2') {
    const item = t.store.createItem({ type: 'task', title, component: 'infra' })
    t.store.updateItem(item.id, { status: 'ready', priority })
    return item.id
  }

  it('is off by default; getAuto reports disabled', () => {
    const t = setup()
    expect(t.runner.getAuto().enabled).toBe(false)
  })

  it('enabling dispatches the highest-priority ready task', () => {
    const t = setup()
    ready(t, 'low', 'P3')
    const hi = ready(t, 'high', 'P0')
    t.runner.setAuto({ enabled: true })
    // the P0 task is now running (concurrency 1)
    expect(t.runner.getJob([...t.spawnCalls.keys ? [] : []] && t.runner.listJobs()[0].id)?.taskId ?? t.store.getItem(hi)?.status).toBe('ai_running')
    expect(t.store.getItem(hi)?.status).toBe('ai_running')
    expect(t.runner.getAuto().dispatched).toBe(1)
  })

  it('on job completion, auto picks the next ready task', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const a = ready(t, 'first', 'P1')
    const b = ready(t, 'second', 'P2')
    t.runner.setAuto({ enabled: true })
    t.sendInit(0)
    t.procs[0].emit('exit', 0)                 // first succeeds → review
    await vi.waitFor(() => expect(t.store.getItem(a)?.status).toBe('review'))
    await vi.waitFor(() => expect(t.store.getItem(b)?.status).toBe('ai_running')) // auto picked the next
  })

  it('never auto-dispatches a backlog task', () => {
    const t = setup()
    const bl = t.store.createItem({ type: 'task', title: 'backlog one', component: 'infra' }) // stays backlog
    t.runner.setAuto({ enabled: true })
    expect(t.store.getItem(bl.id)?.status).toBe('backlog')
    expect(t.runner.getAuto().dispatched).toBe(0)
  })

  it('stops at maxAuto and reports paused/capped', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    ready(t, 'one', 'P1'); ready(t, 'two', 'P1'); ready(t, 'three', 'P1')
    t.runner.setAuto({ enabled: true, maxAuto: 2 })
    t.sendInit(0); t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getAuto().dispatched).toBe(2))
    t.sendInit(1); t.procs[1].emit('exit', 0)
    // cap reached: a third ready task is NOT dispatched
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2))
    expect(t.runner.getAuto().dispatched).toBe(2)
  })

  it('pauses after 3 consecutive auto-failures; a success resets', async () => {
    const t = setup() // changedFiles default [] → exit 0 with no commits = failed
    ready(t, 'f1', 'P1'); ready(t, 'f2', 'P1'); ready(t, 'f3', 'P1')
    t.runner.setAuto({ enabled: true, maxAuto: 99 })
    for (let i = 0; i < 3; i++) {
      t.sendInit(i); t.procs[i].emit('exit', 0)              // exit 0, no commit → failed
      await vi.waitFor(() => expect(t.procs.length).toBeGreaterThanOrEqual(i + 1))
    }
    await vi.waitFor(() => expect(t.runner.getAuto().paused).toBe(true))
    expect(t.runner.getAuto().pauseReason).toMatch(/fail/i)
  })

  it('disabling stops further auto-dispatch', () => {
    const t = setup()
    ready(t, 'x', 'P1'); ready(t, 'y', 'P1')
    t.runner.setAuto({ enabled: true })   // dispatches x
    t.runner.setAuto({ enabled: false })  // stop
    expect(t.runner.getAuto().enabled).toBe(false)
    expect(t.spawnCalls.length).toBe(1)   // y not dispatched
  })
})
```

(If `setup()` doesn't expose `spawnCalls` as an array or `sendInit(i)` signature differs, adapt to the actual harness — read `runner.test.ts` first. The intent of each assertion is what matters; keep them unweakened. The first test's odd expression is a typo — assert simply `expect(t.store.getItem(hi)?.status).toBe('ai_running')` and `dispatched === 1`.)

- [ ] **Step 3:** Run `cd plugins/jd/tools/project-board && npx vitest run server/src/runner.test.ts` — FAIL (setAuto/getAuto/autoTick missing).

- [ ] **Step 4: Implement in `server/src/jobs/runner.ts`.** Add imports `import { existsSync } from 'node:fs'` if missing (writeFileSync/readFileSync/path already imported). Add fields + methods to `JobRunner`:

```ts
  private auto = { enabled: false, paused: false, pauseReason: undefined as string | undefined,
    maxAuto: 10, failureThreshold: 3, dispatched: 0, consecutiveFailures: 0 }
  private autoJobs = new Set<string>()
  private autoTimer?: NodeJS.Timeout
  private shuttingDown = false
```

In the constructor, AFTER `recoverInterrupted()` (and the orphan reconcile if present), load persisted auto settings + maybe start:

```ts
    if (deps) { this.loadAuto(); if (this.auto.enabled) this.startAutoInterval() }
```

Methods:

```ts
  getAuto(): AutoState {
    return {
      enabled: this.auto.enabled, paused: this.auto.paused, pauseReason: this.auto.pauseReason,
      maxAuto: this.auto.maxAuto, dispatched: this.auto.dispatched,
      consecutiveFailures: this.auto.consecutiveFailures,
      maxConcurrent: this.deps?.maxConcurrent ?? 1,
    }
  }

  setAuto(patch: { enabled?: boolean; maxAuto?: number }): AutoState {
    if (typeof patch.maxAuto === 'number' && patch.maxAuto >= 1) this.auto.maxAuto = Math.floor(patch.maxAuto)
    if (typeof patch.enabled === 'boolean') {
      this.auto.enabled = patch.enabled
      // any enable (incl. resume) clears the brakes for a fresh session
      this.auto.dispatched = 0
      this.auto.consecutiveFailures = 0
      this.auto.paused = false
      this.auto.pauseReason = undefined
    } else if (patch.maxAuto !== undefined) {
      // raising the cap can lift a cap-induced stall
      this.auto.dispatched = 0
    }
    this.persistAuto()
    if (this.auto.enabled) { this.startAutoInterval(); this.autoTick() } else { this.stopAutoInterval() }
    this.deps?.hub.broadcast({ type: 'board_update' })
    return this.getAuto()
  }

  autoTick(): void {
    if (!this.deps || this.shuttingDown) return
    while (this.auto.enabled && !this.auto.paused
      && this.auto.dispatched < this.auto.maxAuto
      && this.running.size < this.deps.maxConcurrent) {
      const next = this.nextReadyTask()
      if (!next) break
      try {
        const job = this.dispatchTask(next)
        this.autoJobs.add(job.id)
        this.auto.dispatched++
        this.persistAuto()
      } catch { break } // duplicate-active race or similar: stop this tick
    }
  }

  private nextReadyTask(): string | undefined {
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
    const ready = this.deps!.store.scan().items
      .filter((i) => i.status === 'ready' && !this.hasActiveJob((j) => j.kind === 'task' && j.taskId === i.id))
      .sort((a, b) => (order[a.priority] - order[b.priority]) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    return ready[0]?.id
  }

  private startAutoInterval(): void {
    if (this.autoTimer) return
    this.autoTimer = setInterval(() => this.autoTick(), 8000)
    this.autoTimer.unref?.()
  }
  private stopAutoInterval(): void {
    if (this.autoTimer) clearInterval(this.autoTimer)
    this.autoTimer = undefined
  }

  private loadAuto(): void {
    try {
      const raw = JSON.parse(readFileSync(this.autoFile(), 'utf8')) as { enabled?: boolean; maxAuto?: number; failureThreshold?: number }
      if (typeof raw.enabled === 'boolean') this.auto.enabled = raw.enabled
      if (typeof raw.maxAuto === 'number' && raw.maxAuto >= 1) this.auto.maxAuto = Math.floor(raw.maxAuto)
      if (typeof raw.failureThreshold === 'number' && raw.failureThreshold >= 1) this.auto.failureThreshold = Math.floor(raw.failureThreshold)
    } catch { /* missing/corrupt → defaults */ }
  }
  private persistAuto(): void {
    if (!this.deps) return
    try {
      writeFileSync(this.autoFile(), JSON.stringify({ enabled: this.auto.enabled, maxAuto: this.auto.maxAuto, failureThreshold: this.auto.failureThreshold }, null, 2))
    } catch { /* best-effort */ }
  }
  private autoFile(): string {
    return path.join(this.deps!.store.dataDir, 'auto.json')
  }
```

`hasActiveJob` already exists (used by dispatch guards) — reuse it. `BoardStore.dataDir` is a public readonly field — confirm and use it.

- [ ] **Step 5: Hook the terminal handler.** In `finishKeepState(job)` (called by every terminal finish), BEFORE the existing `this.deps?.hub.broadcast(...)`, add the auto bookkeeping, and AFTER the broadcast add an `autoTick()`:

```ts
  private finishKeepState(job: Job): void {
    job.endedAt = new Date().toISOString()
    this.persist(job)
    if (this.autoJobs.has(job.id)) {
      if (job.state === 'failed') {
        this.auto.consecutiveFailures++
        if (this.auto.consecutiveFailures >= this.auto.failureThreshold) {
          this.auto.paused = true
          this.auto.pauseReason = `${this.auto.failureThreshold} auto jobs failed in a row`
        }
      } else if (job.state === 'succeeded') {
        this.auto.consecutiveFailures = 0
      }
    }
    this.deps?.hub.broadcast({ type: 'board_update' })
    this.autoTick()
  }
```

(Keep the rest of `finishKeepState` as-is — only add the autoJobs block + the trailing `autoTick()`. `autoTick` is a no-op when auto is off or `shuttingDown`.)

- [ ] **Step 6: Guard shutdown.** In `shutdown()`, set `this.shuttingDown = true` at the top and `this.stopAutoInterval()`, so the finish-triggered `autoTick()` during shutdown does nothing.

- [ ] **Step 7:** Run the suite. Expected: prior 158 + the new auto tests green. `npm run typecheck` clean. Fix harness-shape mismatches in the tests only (never weaken assertions).

- [ ] **Step 8: Commit.**

```bash
git add ui/src/types.ts server/src/jobs/runner.ts server/src/runner.test.ts
git commit -m "feat(board): auto-dispatch engine — autoTick, run cap, failure pause, persistence"
```

---

### Task 2: Routes — GET/POST /api/auto (TDD)

**Files:**
- Modify: `server/src/api/routes.ts`, `server/src/routes.test.ts`

- [ ] **Step 1: Failing tests** — append to `server/src/routes.test.ts`:

```ts
describe('auto routes', () => {
  it('GET /api/auto returns the disabled default shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j).toMatchObject({ enabled: false, paused: false, dispatched: 0 })
    expect(typeof j.maxAuto).toBe('number')
    expect(typeof j.maxConcurrent).toBe('number')
  })

  it('POST /api/auto enables and sets maxAuto', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { enabled: true, maxAuto: 5 } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: true, maxAuto: 5 })
    const get = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    expect(get.json().enabled).toBe(true)
  })

  it('POST /api/auto disables', async () => {
    await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { enabled: true } })
    const res = await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { enabled: false } })
    expect(res.json().enabled).toBe(false)
  })

  it('POST /api/auto rejects a non-positive maxAuto', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { maxAuto: 0 } })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2:** Run — FAIL (routes missing).

- [ ] **Step 3: Implement** — append inside `registerRoutes` in `server/src/api/routes.ts`:

```ts
  app.get('/api/auto', () => deps.runner.getAuto())

  app.post<{ Body: { enabled?: boolean; maxAuto?: number } }>('/api/auto', (req, reply) => {
    const { enabled, maxAuto } = req.body ?? {}
    if (maxAuto !== undefined && (typeof maxAuto !== 'number' || maxAuto < 1)) {
      return reply.code(400).send({ error: 'maxAuto must be a positive number' })
    }
    return deps.runner.setAuto({ enabled, maxAuto })
  })
```

- [ ] **Step 4:** Full suite + typecheck green. Commit:

```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): auto state routes (GET/POST /api/auto)"
```

---

### Task 3: UI — AutoControl in the header

**Files:**
- Modify: `ui/src/api.ts`, `ui/src/App.tsx`
- Create: `ui/src/components/AutoControl.tsx`

- [ ] **Step 1: api.** In `ui/src/api.ts` add `AutoState` to the type import and:

```ts
  getAuto: () => request<AutoState>('/api/auto'),
  setAuto: (patch: { enabled?: boolean; maxAuto?: number }) =>
    request<AutoState>('/api/auto', { method: 'POST', body: JSON.stringify(patch) }),
```

- [ ] **Step 2: AutoControl.** Create `ui/src/components/AutoControl.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import type { AutoState } from '../types.js'

export function AutoControl({ refreshKey }: { refreshKey: number }) {
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { api.getAuto().then(setAuto).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function toggle() {
    if (!auto) return
    setBusy(true)
    try { setAuto(await api.setAuto({ enabled: !auto.enabled })) } catch { /* ignore */ } finally { setBusy(false) }
  }
  async function resume() {
    setBusy(true)
    try { setAuto(await api.setAuto({ enabled: true })) } catch { /* ignore */ } finally { setBusy(false) }
  }
  async function setMax(n: number) {
    setBusy(true)
    try { setAuto(await api.setAuto({ maxAuto: n })) } catch { /* ignore */ } finally { setBusy(false) }
  }

  if (!auto) return null
  const label = !auto.enabled ? 'Tự động: Tắt'
    : auto.paused ? `Tự động: Tạm dừng — ${auto.pauseReason ?? ''}`
    : `Tự động: Đang chạy · ${auto.dispatched}/${auto.maxAuto}`
  const tone = !auto.enabled ? 'text-text-muted' : auto.paused ? 'text-danger' : 'text-accent'

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <button disabled={busy} onClick={() => void toggle()}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${auto.enabled ? 'bg-gradient-to-r from-accent-strong to-accent-deep text-[#e6fbff]' : 'border border-border text-text-secondary hover:bg-raised'}`}>
        {auto.enabled ? 'Tắt tự động' : 'Bật tự động'}
      </button>
      <span className={`text-xs ${tone}`}>{label}</span>
      {auto.paused && (
        <button disabled={busy} onClick={() => void resume()}
          className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">Tiếp tục</button>
      )}
      <input type="number" min={1} value={auto.maxAuto}
        onChange={(e) => { const n = Number(e.target.value); if (n >= 1) void setMax(n) }}
        title="Số task tối đa auto chạy mỗi phiên"
        className="w-14 rounded border border-border bg-sunken px-1 py-1 text-xs text-text-primary outline-none focus:border-accent" />
    </div>
  )
}
```

- [ ] **Step 3: Mount in App.** In `ui/src/App.tsx`, render `<AutoControl refreshKey={...} />` in the header row (next to the "⊕ Thêm task / bug" button). Use a value that changes on board updates so it re-fetches — the simplest is a counter bumped when `snapshot` changes, or pass `snapshot?.jobs.length` (changes as jobs come/go). Concretely: `import { AutoControl } from './components/AutoControl.js'` and in the header `div` add `<AutoControl refreshKey={snapshot.jobs.length} />` (jobs.length changes as auto dispatches/finishes, prompting a re-fetch of auto state). Keep the existing header buttons.

- [ ] **Step 4:** `npm run typecheck && npx vite build ui && npx vitest run` (prior + auto tests) + grep-gate (`grep -rnE '(zinc|cyan|red|green|orange|rose|amber)-[0-9]' ui/src || echo GREP-CLEAN`).

- [ ] **Step 5: Commit.**

```bash
git add ui/src/api.ts ui/src/components/AutoControl.tsx ui/src/App.tsx
git commit -m "feat(board-ui): auto-dispatch control in the header"
```

---

### Task 4: deploy + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` (report count) + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.20.0`; commit `chore(jd): bump plugin to 0.20.0 (auto-dispatch)`. Then `git checkout main && git merge --no-ff auto-dispatch && git branch -d auto-dispatch && git push origin main`.

- [ ] **Step 3: Build dist + restart board** open on :4400 per the project-board skill (`BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 node dist/server/src/index.js`). Auto starts OFF (no auto.json yet → default disabled).

- [ ] **Step 4: Prove (no real AI run needed for the wiring).**
  - `curl -s http://127.0.0.1:4400/api/auto` → `{enabled:false, maxAuto:10, maxConcurrent:1, ...}`.
  - `curl -s -X POST http://127.0.0.1:4400/api/auto -H 'content-type: application/json' -d '{"maxAuto":3}'` then GET → maxAuto 3 persisted (check `project-board/data/auto.json` exists with `maxAuto:3`).
  - Leave `enabled:false` for the deploy (do NOT turn auto on with a real backlog unless the owner wants a live run — that would start real claude jobs). Report that the control is live and OFF by default; the owner flips it on from the header when ready.
  - In the UI: confirm the "Tự động" control shows in the header with the toggle + maxAuto input.

---

## Self-review notes

- Spec coverage: autoTick highest-priority-ready picker (T1), triggers enable/finish/8s-interval (T1: setAuto+finishKeepState+startAutoInterval), stop-at-review (autoTick only dispatches; merge stays manual), ready-only/no-backlog (nextReadyTask filters status==='ready'), maxAuto cap + consecutive-failure pause + reset-on-boot (T1 counters in-memory; persist only enabled/maxAuto/failureThreshold), shutdown guard (T1), GET/POST routes + validation (T2), AutoControl + api (T3), deploy default-OFF (T4).
- Type consistency: `AutoState` defined in `ui/src/types.ts` (T1), returned by `getAuto`/`setAuto` and consumed by routes + api + AutoControl. `nextReadyTask`/`autoTick`/`hasActiveJob`/`store.dataDir` all on existing surfaces.
- Safety: counters reset on boot (loadAuto only restores enabled/maxAuto/failureThreshold); `shuttingDown` prevents dispatch during shutdown; autoTick wraps dispatch in try/catch; routes validate maxAuto ≥ 1.
- `auto.json` lives in `data/` — gitignored in gamesync (whole `project-board/` excluded). For the skill's generic target-repo setup, adding `auto.json` next to the `jobs/` ignore is a follow-up; not needed for gamesync.
- Cost guard reiterated: deploy with concurrency 1 + auto OFF; owner enables deliberately.
