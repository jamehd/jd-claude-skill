# Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A header Settings popover that edits `maxConcurrent`, `maxAuto`, and `failureThreshold` at runtime (no restart) and persists them in `auto.json` — per spec `docs/specs/2026-06-12-settings-panel-design.md`.

**Architecture:** Make the runner's concurrency limit a mutable field seeded from persisted value or the `BOARD_MAX_JOBS` env; `setAuto` gains `maxConcurrent`/`failureThreshold` (raising concurrency re-pumps the queue). `POST /api/auto` validates + applies them. A `SettingsPanel` gear popover drives it; `AutoControl` slims to toggle+status.

**Tech Stack:** existing Fastify/React 19/Tailwind 4 (Aurora tokens)/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `settings-panel`, tool dir `plugins/jd/tools/project-board`. Paths below relative to the tool dir.

---

## File structure

```
ui/src/types.ts                       # AutoState += failureThreshold
server/src/jobs/runner.ts             # mutable maxConcurrent, setAuto(+maxConcurrent,+failureThreshold), load/persist, pump uses field
server/src/runner.test.ts             # runtime concurrency + persistence tests
server/src/api/routes.ts              # POST /api/auto validates+applies maxConcurrent/failureThreshold
server/src/routes.test.ts             # route validation tests
ui/src/api.ts                         # widen setAuto patch type
ui/src/components/SettingsPanel.tsx    # NEW gear + popover
ui/src/components/AutoControl.tsx      # remove maxAuto input (keep toggle/status/resume)
ui/src/App.tsx                        # mount SettingsPanel
DESIGN_SYSTEM.md                       # gear/Settings popover note
```

---

### Task 1: Runner — runtime maxConcurrent + settings persistence (TDD)

**Files:** Modify `ui/src/types.ts`, `server/src/jobs/runner.ts`; Test: `server/src/runner.test.ts`.

- [ ] **Step 1: Branch + AutoState.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b settings-panel`. In `ui/src/types.ts`, add `failureThreshold` to `AutoState` (after `maxConcurrent`):

```ts
export interface AutoState {
  enabled: boolean
  paused: boolean
  pauseReason?: string
  maxAuto: number
  dispatched: number
  consecutiveFailures: number
  maxConcurrent: number
  failureThreshold: number
}
```

- [ ] **Step 2: Failing tests** — append to `server/src/runner.test.ts` (read `setup()` first; note its `deps.maxConcurrent` — the existing auto tests assume 1; confirm and use that. Use `dataDir` to read `auto.json`).

```ts
import { readFileSync } from 'node:fs'   // add if not already imported at top of the test file

describe('settings (maxConcurrent + failureThreshold)', () => {
  function ready(t: ReturnType<typeof setup>, title: string, priority: 'P0'|'P1'|'P2'|'P3' = 'P2') {
    const item = t.store.createItem({ type: 'task', title, component: 'infra' })
    t.store.updateItem(item.id, { status: 'ready', priority })
    return item.id
  }

  it('getAuto reports the seeded maxConcurrent and failureThreshold', () => {
    const t = setup()
    const a = t.runner.getAuto()
    expect(typeof a.maxConcurrent).toBe('number')
    expect(a.failureThreshold).toBe(3)
  })

  it('raising maxConcurrent starts a queued job immediately (pump)', () => {
    const t = setup() // concurrency 1
    const a = ready(t, 'a', 'P1')
    const b = ready(t, 'b', 'P1')
    t.runner.dispatchTask(a)            // a runs
    t.runner.dispatchTask(b)            // b queued (concurrency 1)
    expect(t.spawnCalls.length).toBe(1)
    t.runner.setAuto({ maxConcurrent: 2 })
    expect(t.runner.getAuto().maxConcurrent).toBe(2)
    expect(t.spawnCalls.length).toBe(2) // b started by the re-pump
  })

  it('lowering maxConcurrent does not kill running jobs; caps new dispatch', () => {
    const t = setup()
    t.runner.setAuto({ maxConcurrent: 2 })
    const a = ready(t, 'a', 'P1'); const b = ready(t, 'b', 'P1'); const c = ready(t, 'c', 'P1')
    t.runner.dispatchTask(a); t.runner.dispatchTask(b)   // both run (limit 2)
    expect(t.spawnCalls.length).toBe(2)
    t.runner.setAuto({ maxConcurrent: 1 })               // lower; running jobs continue
    t.runner.dispatchTask(c)                              // queued, not started (2 still running > new limit 1)
    expect(t.spawnCalls.length).toBe(2)
  })

  it('persists maxConcurrent + failureThreshold to auto.json and restores on a fresh runner', () => {
    const t = setup()
    t.runner.setAuto({ maxConcurrent: 4, failureThreshold: 5 })
    const saved = JSON.parse(readFileSync(`${t.dataDir}/auto.json`, 'utf8'))
    expect(saved.maxConcurrent).toBe(4)
    expect(saved.failureThreshold).toBe(5)
    const fresh = makeRunner(t)   // construct a new runner on the same dataDir/deps — see note
    expect(fresh.getAuto().maxConcurrent).toBe(4)
    expect(fresh.getAuto().failureThreshold).toBe(5)
  })
})
```

NOTE: if the harness has no `makeRunner(t)` helper to build a second runner on the same `dataDir`, construct one the same way `setup()` does (reuse its deps with the same `dataDir`/store) — read `setup()` and mirror it. The intent is "a new runner loads persisted settings". If building a second runner is impractical in the harness, assert persistence by reading `auto.json` (the `saved.*` asserts) and add a separate `loadAuto` unit assertion via a fresh runner constructed inline.

- [ ] **Step 3:** Run `cd plugins/jd/tools/project-board && npx vitest run server/src/runner.test.ts` — FAIL (setAuto lacks maxConcurrent/failureThreshold; getAuto lacks failureThreshold; limit not mutable).

- [ ] **Step 4: Implement in `server/src/jobs/runner.ts`.**

(a) Add a mutable field near the other private fields (after line ~65):
```ts
  private maxConcurrent = 1
```

(b) In the constructor, seed it from deps BEFORE `loadAuto()` (so a persisted value can override), inside the `if (deps)` block:
```ts
    if (deps) {
      this.maxConcurrent = deps.maxConcurrent
      this.recoverInterrupted()
      this.reconcileOrphanedTasks()
      this.loadAuto()
      if (this.auto.enabled) { this.startAutoInterval(); this.autoTick() }
    }
```

(c) `getAuto()` — return the live field + failureThreshold:
```ts
  getAuto(): AutoState {
    return {
      enabled: this.auto.enabled, paused: this.auto.paused, pauseReason: this.auto.pauseReason,
      maxAuto: this.auto.maxAuto, dispatched: this.auto.dispatched,
      consecutiveFailures: this.auto.consecutiveFailures,
      maxConcurrent: this.maxConcurrent,
      failureThreshold: this.auto.failureThreshold,
    }
  }
```

(d) `setAuto` — widen the patch and handle the two new fields (apply maxConcurrent → re-pump; failureThreshold → live). Keep all existing enable/maxAuto logic:
```ts
  setAuto(patch: { enabled?: boolean; maxAuto?: number; maxConcurrent?: number; failureThreshold?: number }): AutoState {
    if (typeof patch.maxAuto === 'number' && patch.maxAuto >= 1) this.auto.maxAuto = Math.floor(patch.maxAuto)
    if (typeof patch.failureThreshold === 'number' && patch.failureThreshold >= 1) this.auto.failureThreshold = Math.floor(patch.failureThreshold)
    let pumpNeeded = false
    if (typeof patch.maxConcurrent === 'number' && patch.maxConcurrent >= 1) {
      this.maxConcurrent = Math.floor(patch.maxConcurrent)
      pumpNeeded = true
    }
    if (typeof patch.enabled === 'boolean') {
      this.auto.enabled = patch.enabled
      // Any enable (including resume) clears the brakes for a fresh session.
      this.auto.dispatched = 0
      this.auto.consecutiveFailures = 0
      this.auto.paused = false
      this.auto.pauseReason = undefined
      this.autoFailedTasks.clear()
    } else if (patch.maxAuto !== undefined) {
      // Raising the cap can lift a cap-induced stall.
      this.auto.dispatched = 0
    }
    this.persistAuto()
    if (pumpNeeded) this.pump()           // a raised limit starts queued jobs now
    if (this.auto.enabled) { this.startAutoInterval(); this.autoTick() } else { this.stopAutoInterval() }
    this.deps?.hub.broadcast({ type: 'board_update' })
    return this.getAuto()
  }
```

(e) `autoTick` and `pump` — use the field instead of `this.deps.maxConcurrent`:
- line ~232 in `autoTick`: `&& this.running.size < this.maxConcurrent) {`
- line ~331 in `pump`: `while (this.running.size < this.maxConcurrent && this.dispatchQueue.length > 0) {`

(f) `loadAuto` — also restore maxConcurrent:
```ts
  private loadAuto(): void {
    try {
      const raw = JSON.parse(readFileSync(this.autoFile(), 'utf8')) as { enabled?: boolean; maxAuto?: number; failureThreshold?: number; maxConcurrent?: number }
      if (typeof raw.enabled === 'boolean') this.auto.enabled = raw.enabled
      if (typeof raw.maxAuto === 'number' && raw.maxAuto >= 1) this.auto.maxAuto = Math.floor(raw.maxAuto)
      if (typeof raw.failureThreshold === 'number' && raw.failureThreshold >= 1) this.auto.failureThreshold = Math.floor(raw.failureThreshold)
      if (typeof raw.maxConcurrent === 'number' && raw.maxConcurrent >= 1) this.maxConcurrent = Math.floor(raw.maxConcurrent)
    } catch { /* missing/corrupt -> defaults */ }
  }
```

(g) `persistAuto` — also write maxConcurrent:
```ts
  private persistAuto(): void {
    if (!this.deps) return
    try {
      writeFileSync(this.autoFile(), JSON.stringify({ enabled: this.auto.enabled, maxAuto: this.auto.maxAuto, failureThreshold: this.auto.failureThreshold, maxConcurrent: this.maxConcurrent }, null, 2))
    } catch { /* best-effort */ }
  }
```

- [ ] **Step 5:** Run the full suite + `npm run typecheck`. Prior tests + the new settings tests green. Fix only harness-shape mismatches in tests (never weaken assertions).

- [ ] **Step 6: Commit.**

```bash
git add ui/src/types.ts server/src/jobs/runner.ts server/src/runner.test.ts
git commit -m "feat(board): runtime maxConcurrent + failureThreshold, persisted in auto.json"
```

---

### Task 2: Routes — accept + validate maxConcurrent/failureThreshold (TDD)

**Files:** Modify `server/src/api/routes.ts`; Test: `server/src/routes.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/routes.test.ts`:

```ts
describe('settings via /api/auto', () => {
  it('GET /api/auto includes failureThreshold and maxConcurrent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    const j = res.json()
    expect(typeof j.failureThreshold).toBe('number')
    expect(typeof j.maxConcurrent).toBe('number')
  })
  it('POST sets maxConcurrent and failureThreshold', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { maxConcurrent: 3, failureThreshold: 5 } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ maxConcurrent: 3, failureThreshold: 5 })
  })
  it('rejects maxConcurrent below 1 or above 8', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { maxConcurrent: 0 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { maxConcurrent: 9 } })).statusCode).toBe(400)
  })
  it('rejects failureThreshold below 1', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { failureThreshold: 0 } })).statusCode).toBe(400)
  })
})
```

- [ ] **Step 2:** Run — FAIL (route ignores/!validates the new fields).

- [ ] **Step 3: Implement** — replace the existing `POST /api/auto` handler body in `server/src/api/routes.ts` with one that validates all four fields:

```ts
  app.post<{ Body: { enabled?: boolean; maxAuto?: number; maxConcurrent?: number; failureThreshold?: number } }>('/api/auto', (req, reply) => {
    const { enabled, maxAuto, maxConcurrent, failureThreshold } = req.body ?? {}
    if (maxAuto !== undefined && (typeof maxAuto !== 'number' || maxAuto < 1)) {
      return reply.code(400).send({ error: 'maxAuto must be a positive number' })
    }
    if (maxConcurrent !== undefined && (typeof maxConcurrent !== 'number' || maxConcurrent < 1 || maxConcurrent > 8)) {
      return reply.code(400).send({ error: 'maxConcurrent must be between 1 and 8' })
    }
    if (failureThreshold !== undefined && (typeof failureThreshold !== 'number' || failureThreshold < 1)) {
      return reply.code(400).send({ error: 'failureThreshold must be a positive number' })
    }
    return deps.runner.setAuto({ enabled, maxAuto, maxConcurrent, failureThreshold })
  })
```

- [ ] **Step 4:** Full suite + typecheck green. Commit:

```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): /api/auto accepts + validates maxConcurrent (1-8) and failureThreshold"
```

---

### Task 3: UI — Settings gear popover + slim AutoControl

**Files:** Modify `ui/src/api.ts`, `ui/src/components/AutoControl.tsx`, `ui/src/App.tsx`; Create `ui/src/components/SettingsPanel.tsx`; Modify `DESIGN_SYSTEM.md`.

- [ ] **Step 1: api.ts.** Widen `setAuto`'s patch type:

```ts
  setAuto: (patch: { enabled?: boolean; maxAuto?: number; maxConcurrent?: number; failureThreshold?: number }) =>
    request<AutoState>('/api/auto', { method: 'POST', body: JSON.stringify(patch) }),
```

- [ ] **Step 2: SettingsPanel.** Create `ui/src/components/SettingsPanel.tsx` (verify token class names against `ui/src/index.css` — `bg-surface`, `bg-sunken`, `border-border`, `text-text-*`, `text-accent`, `from-accent-strong`, `to-accent-deep`, `focus:border-accent` all exist; substitute real names if any differ):

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import type { AutoState } from '../types.js'

export function SettingsPanel({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false)
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [conc, setConc] = useState(1)
  const [maxAuto, setMaxAuto] = useState(10)
  const [thresh, setThresh] = useState(3)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.getAuto().then((a) => {
      setAuto(a); setConc(a.maxConcurrent); setMaxAuto(a.maxAuto); setThresh(a.failureThreshold)
    }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  async function save() {
    setBusy(true); setMsg('')
    try {
      const a = await api.setAuto({ maxConcurrent: conc, maxAuto, failureThreshold: thresh })
      setAuto(a); setMsg('Đã lưu')
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  function field(label: string, val: number, set: (n: number) => void, min: number, max?: number) {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-text-secondary">
        <span>{label}</span>
        <input type="number" min={min} max={max} value={val}
          onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) set(n) }}
          className="w-20 rounded border border-border bg-sunken px-2 py-1 text-text-primary outline-none focus:border-accent" />
      </label>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { if (!open) load(); setOpen((o) => !o) }} title="Cài đặt"
        className="rounded-xl border border-border bg-surface px-3 py-2 text-text-secondary transition-colors duration-150 hover:bg-raised">⚙</button>
      {open && auto && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-2xl">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Cài đặt vận hành</h3>
          {field('Số task song song (1–8)', conc, setConc, 1, 8)}
          {field('maxAuto (auto/phiên)', maxAuto, setMaxAuto, 1)}
          {field('Ngưỡng tạm dừng auto', thresh, setThresh, 1)}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{msg}</span>
            <button disabled={busy} onClick={() => void save()}
              className="rounded bg-gradient-to-r from-accent-strong to-accent-deep px-3 py-1 text-xs font-medium text-[#e6fbff] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Lưu</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Slim AutoControl.** In `ui/src/components/AutoControl.tsx`, REMOVE the `maxAuto` number `<input>` (the trailing `<input type="number" … title="Số task tối đa…" />`) and its `setMax` handler. Keep the toggle button, the status `<span>` label, and the paused/resume button. (maxAuto is now edited in SettingsPanel; AutoControl still displays `{dispatched}/{maxAuto}` from its `getAuto` fetch.)

- [ ] **Step 4: Mount in App.** In `ui/src/App.tsx`, `import { SettingsPanel } from './components/SettingsPanel.js'` and render `<SettingsPanel refreshKey={snapshot.jobs.length} />` in the header row next to `<AutoControl … />`. Keep existing header content.

- [ ] **Step 5: DESIGN_SYSTEM.md.** Add a short note: the ⚙ gear opens a Settings popover (click-outside/Esc to close) for runtime operational knobs (concurrency, maxAuto, failure threshold).

- [ ] **Step 6: Gates.** From the tool dir: `npm run typecheck` clean; `npx vite build ui` succeeds; `npx vitest run` green; grep-gate clean:
```bash
grep -rnE '(zinc|cyan|red|green|orange|rose|amber|slate|gray|neutral|stone|emerald|teal|sky|blue|indigo|violet|purple|fuchsia|pink|lime|yellow)-[0-9]' ui/src && echo GREP-DIRTY || echo GREP-CLEAN
```

- [ ] **Step 7: Commit.**
```bash
git add ui/src/api.ts ui/src/components/SettingsPanel.tsx ui/src/components/AutoControl.tsx ui/src/App.tsx DESIGN_SYSTEM.md
git commit -m "feat(board-ui): settings gear popover (concurrency/maxAuto/threshold); slim AutoControl"
```

---

### Task 4: deploy 0.22.0 + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.22.0`; commit `chore(jd): bump plugin to 0.22.0 (settings panel)`. Then `git checkout main && git merge --no-ff settings-panel && git branch -d settings-panel && git push origin main`.

- [ ] **Step 3: Build dist + restart — ONLY when no jobs are running.** First check `curl -s http://127.0.0.1:4400/api/board` for any `running`/`queued` jobs; if present, wait or tell the owner. Then kill the running `dist/server/src/index.js`, `npm run build`, relaunch (the persisted `auto.json` now drives concurrency, so the env is no longer required, but keep it harmless): `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`.

- [ ] **Step 4: Prove.**
  - `curl -s http://127.0.0.1:4400/api/auto` → includes `maxConcurrent` (the persisted value, e.g. 3) and `failureThreshold`.
  - `POST /api/auto -d '{"maxConcurrent":2}'` → 200, GET shows 2, and `project-board/data/auto.json` has `maxConcurrent:2`.
  - `POST /api/auto -d '{"maxConcurrent":9}'` → 400.
  - In the UI: the ⚙ gear opens the Settings popover; changing concurrency and saving persists (survives a later restart with no `BOARD_MAX_JOBS`).
  - Restore concurrency to the owner's preferred value (e.g. 3) before finishing.

---

## Self-review notes

- Spec coverage: mutable `maxConcurrent` seeded `persisted ?? deps`(env) (T1 constructor+loadAuto), runtime raise re-pumps / lower caps new dispatch (T1 setAuto+pump tests), persist all four keys in auto.json (T1), `AutoState.failureThreshold` (T1), route accepts+validates maxConcurrent 1–8 and failureThreshold ≥1 (T2), gear Settings popover + slim AutoControl + api type (T3), deploy persisted-over-env (T4).
- Type consistency: `setAuto` patch `{enabled?,maxAuto?,maxConcurrent?,failureThreshold?}` in runner (T1), routes (T2), and api.ts (T3); `AutoState` adds `failureThreshold` consumed by getAuto/SettingsPanel/AutoControl. `pump`/`autoTick` now read `this.maxConcurrent`.
- Backward compat: existing `auto.json` without `maxConcurrent` → falls back to `deps.maxConcurrent` (env/default); old AutoState consumers still get all prior fields plus the new one.
- Safety: concurrency capped at 8 server-side (route 400); lowering never kills running jobs (pump only starts, never stops); restart guarded on no-running-jobs (lesson from the prior mid-run restart).
- No new persisted file; `auto.json` already gitignored in the target repo.
