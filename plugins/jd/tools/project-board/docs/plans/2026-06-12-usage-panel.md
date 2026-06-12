# Usage / Rate-limit Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the plan's rate-limit status + reset and the board's own per-job token/cost, aggregated over the 5h window / today / total, via `GET /api/usage` and a header `UsagePanel` — per spec `docs/specs/2026-06-12-usage-panel-design.md`.

**Architecture:** `events.ts` parses `rate_limit_event` (new `rate_limit` ConsoleEvent) and adds `usage` to the `turn_result` event. `runner.handleLine` captures the latest rate-limit snapshot (persisted to `data/usage.json`) and per-job `usage`/`costUsd` (persisted on the Job). `runner.getUsage()` aggregates; `GET /api/usage` exposes it; a `UsagePanel` renders it with a client-side reset countdown.

**Tech Stack:** existing Fastify/React 19/Tailwind 4 (Aurora tokens)/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `usage-panel`, tool dir `plugins/jd/tools/project-board`. Paths below relative to the tool dir.

---

## File structure

```
ui/src/types.ts                       # JobUsage, RateLimitSnapshot, UsageBucket, UsageReport; ConsoleEvent += rate_limit; turn_result += usage; Job += usage,costUsd
server/src/jobs/events.ts             # parse rate_limit_event + usage on result
server/src/events.test.ts             # event parsing tests (create if absent)
server/src/jobs/runner.ts             # capture in handleLine, lastRateLimit + usage.json, getUsage() aggregation
server/src/runner.test.ts             # capture + aggregation tests
server/src/api/routes.ts              # GET /api/usage
server/src/routes.test.ts             # route shape test
ui/src/api.ts                         # getUsage()
ui/src/components/UsagePanel.tsx        # NEW header card
ui/src/App.tsx                        # mount UsagePanel
DESIGN_SYSTEM.md                       # usage panel + informational-cost note
```

---

### Task 1: Types + event parsing (TDD)

**Files:** Modify `ui/src/types.ts`, `server/src/jobs/events.ts`; Test: `server/src/events.test.ts`.

- [ ] **Step 1: Branch + types.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b usage-panel`. In `ui/src/types.ts`:

Add the shared interfaces (near `AutoState`):
```ts
export interface JobUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface RateLimitSnapshot {
  status: string
  rateLimitType: string
  resetsAt: number      // unix seconds
  isUsingOverage: boolean
  capturedAt: string    // ISO
}

export interface UsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  jobs: number
}

export interface UsageReport {
  rateLimit: RateLimitSnapshot | null
  windows: { fiveHour: UsageBucket; today: UsageBucket; total: UsageBucket }
}
```

Add `usage`/`costUsd` to `Job`:
```ts
export interface Job {
  // ...existing fields...
  usage?: JobUsage
  costUsd?: number
}
```

Extend the `ConsoleEvent` union — add a `rate_limit` member and add `usage` to `turn_result`:
```ts
  | { kind: 'turn_result'; ok: boolean; durationMs?: number; costUsd?: number; usage?: JobUsage }
  | { kind: 'rate_limit'; status: string; rateLimitType: string; resetsAt: number; isUsingOverage: boolean }
```
(Replace the existing `turn_result` line; add the `rate_limit` line.)

- [ ] **Step 2: Failing tests** — create `server/src/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeLine } from './jobs/events.js'

describe('normalizeLine usage + rate_limit', () => {
  it('parses a rate_limit_event', () => {
    const line = JSON.stringify({ type: 'rate_limit_event', rate_limit_info: {
      status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600, isUsingOverage: false } })
    const [ev] = normalizeLine(line)
    expect(ev).toMatchObject({ kind: 'rate_limit', status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600, isUsingOverage: false })
  })

  it('parses usage on a result event into turn_result', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1000, total_cost_usd: 0.42,
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } })
    const [ev] = normalizeLine(line)
    expect(ev).toMatchObject({ kind: 'turn_result', ok: true, costUsd: 0.42 })
    expect((ev as { usage?: unknown }).usage).toMatchObject({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheCreationTokens: 5 })
  })

  it('result without usage still yields turn_result (usage undefined)', () => {
    const [ev] = normalizeLine(JSON.stringify({ type: 'result', subtype: 'success' }))
    expect(ev).toMatchObject({ kind: 'turn_result', ok: true })
    expect((ev as { usage?: unknown }).usage).toBeUndefined()
  })
})
```

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/events.test.ts` — FAIL.

- [ ] **Step 4: Implement in `server/src/jobs/events.ts`.** Replace the `if (o.type === 'result')` block and add a `rate_limit_event` block:

```ts
  if (o.type === 'rate_limit_event') {
    const info = (o.rate_limit_info ?? {}) as Record<string, unknown>
    return [{
      kind: 'rate_limit',
      status: String(info.status ?? 'unknown'),
      rateLimitType: String(info.rateLimitType ?? ''),
      resetsAt: typeof info.resetsAt === 'number' ? info.resetsAt : 0,
      isUsingOverage: Boolean(info.isUsingOverage),
    }]
  }
  if (o.type === 'result') {
    const u = (o.usage ?? undefined) as Record<string, unknown> | undefined
    const usage = u ? {
      inputTokens: Number(u.input_tokens ?? 0),
      outputTokens: Number(u.output_tokens ?? 0),
      cacheReadTokens: Number(u.cache_read_input_tokens ?? 0),
      cacheCreationTokens: Number(u.cache_creation_input_tokens ?? 0),
    } : undefined
    return [{
      kind: 'turn_result',
      ok: o.subtype === 'success',
      durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : undefined,
      costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
      usage,
    }]
  }
```

- [ ] **Step 5:** `npx vitest run` (full suite) + `npm run typecheck` green.

- [ ] **Step 6: Commit.**
```bash
git add ui/src/types.ts server/src/jobs/events.ts server/src/events.test.ts
git commit -m "feat(board): parse rate_limit_event + result usage in normalizeLine"
```

---

### Task 2: Runner — capture + persist + aggregate (TDD)

**Files:** Modify `server/src/jobs/runner.ts`; Test: `server/src/runner.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/runner.test.ts` (read the `setup()` harness: it must let you feed stream lines to a running job — the existing tests use `t.sendInit(i)` / emit lines via `t.procs[i]`; find how a job's stdout line is injected, e.g. a `feed(i, obj)` helper or `procs[i].stdout.emit('data', ...)` — mirror existing tests). Use `readFileSync` to check `usage.json`.

```ts
describe('usage capture + aggregation', () => {
  it('captures per-job usage + cost from a result line', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const id = t.store.createItem({ type: 'task', title: 'u', component: 'infra' }).id
    const job = t.runner.dispatchTask(id)
    t.sendInit(0)
    t.feedLine(0, { type: 'result', subtype: 'success', total_cost_usd: 0.5,
      usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.usage?.inputTokens).toBe(200))
    expect(t.runner.getJob(job.id)?.costUsd).toBe(0.5)
  })

  it('captures + persists the latest rate-limit snapshot', () => {
    const t = setup()
    const id = t.store.createItem({ type: 'task', title: 'r', component: 'infra' }).id
    t.runner.dispatchTask(id); t.sendInit(0)
    t.feedLine(0, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600, isUsingOverage: false } })
    const rl = t.runner.getUsage().rateLimit
    expect(rl).toMatchObject({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600 })
    const saved = JSON.parse(readFileSync(`${t.dataDir}/usage.json`, 'utf8'))
    expect(saved.resetsAt).toBe(1781265600)
  })

  it('aggregates total tokens across jobs with usage', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const a = t.store.createItem({ type: 'task', title: 'a', component: 'infra' }).id
    const j = t.runner.dispatchTask(a); t.sendInit(0)
    t.feedLine(0, { type: 'result', subtype: 'success', total_cost_usd: 1,
      usage: { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(j.id)?.usage).toBeDefined())
    const u = t.runner.getUsage()
    expect(u.windows.total.inputTokens).toBe(100)
    expect(u.windows.total.outputTokens).toBe(100)
    expect(u.windows.total.costUsd).toBe(1)
    expect(u.windows.total.jobs).toBe(1)
  })

  it('getUsage with no data: rateLimit null, zeroed buckets', () => {
    const t = setup()
    const u = t.runner.getUsage()
    expect(u.rateLimit).toBeNull()
    expect(u.windows.total.jobs).toBe(0)
  })
})
```

If the harness lacks a `feedLine(i, obj)` helper, add one to `setup()` (it should write a JSON line to the proc's stdout the same way `sendInit` does — read `sendInit`'s implementation and mirror it with an arbitrary object). Keep assertion intent.

- [ ] **Step 2:** Run — FAIL (`getUsage`/capture missing).

- [ ] **Step 3: Implement in `server/src/jobs/runner.ts`.**

Add imports if needed (`existsSync` already imported set; `readFileSync`/`writeFileSync`/`path` present).

Add fields near the other private fields:
```ts
  private lastRateLimit?: import('../../../ui/src/types.js').RateLimitSnapshot
```
(or add `RateLimitSnapshot` to the existing type import at the top of the file and use it bare.)

In the constructor `if (deps)` block, after `loadAuto()`, load the persisted snapshot:
```ts
      this.loadUsage()
```

In `handleLine`, inside the `for (const event of normalizeLine(line))` loop, BEFORE `this.emit(job, event)`, capture:
```ts
      if (event.kind === 'turn_result' && event.usage) {
        job.usage = event.usage
        if (typeof event.costUsd === 'number') job.costUsd = event.costUsd
        this.persist(job)
      }
      if (event.kind === 'rate_limit') {
        this.lastRateLimit = {
          status: event.status, rateLimitType: event.rateLimitType,
          resetsAt: event.resetsAt, isUsingOverage: event.isUsingOverage,
          capturedAt: new Date().toISOString(),
        }
        this.persistUsage()
      }
```

Add load/persist helpers (mirror `loadAuto`/`persistAuto`):
```ts
  private usageFile(): string {
    return path.join(this.deps!.store.dataDir, 'usage.json')
  }
  private loadUsage(): void {
    try {
      const raw = JSON.parse(readFileSync(this.usageFile(), 'utf8')) as Partial<RateLimitSnapshot>
      if (raw && typeof raw.resetsAt === 'number') {
        this.lastRateLimit = {
          status: String(raw.status ?? 'unknown'), rateLimitType: String(raw.rateLimitType ?? ''),
          resetsAt: raw.resetsAt, isUsingOverage: Boolean(raw.isUsingOverage),
          capturedAt: String(raw.capturedAt ?? new Date(0).toISOString()),
        }
      }
    } catch { /* missing/corrupt -> none */ }
  }
  private persistUsage(): void {
    if (!this.deps || !this.lastRateLimit) return
    try { writeFileSync(this.usageFile(), JSON.stringify(this.lastRateLimit, null, 2)) } catch { /* best-effort */ }
  }
```

Add the aggregation method (uses `this.jobs`, which `recoverInterrupted` populates with all persisted jobs on boot):
```ts
  getUsage(): UsageReport {
    const empty = (): UsageBucket => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, jobs: 0 })
    const windows = { fiveHour: empty(), today: empty(), total: empty() }
    const now = Date.now()
    // Window start: align to the current rate-limit window when known, else last 5h.
    const fiveHourStart = this.lastRateLimit?.resetsAt
      ? this.lastRateLimit.resetsAt * 1000 - 5 * 60 * 60 * 1000
      : now - 5 * 60 * 60 * 1000
    const todayStr = new Date().toISOString().slice(0, 10)
    const add = (b: UsageBucket, u: JobUsage, cost: number) => {
      b.inputTokens += u.inputTokens; b.outputTokens += u.outputTokens
      b.cacheReadTokens += u.cacheReadTokens; b.cacheCreationTokens += u.cacheCreationTokens
      b.costUsd += cost; b.jobs += 1
    }
    for (const job of this.jobs.values()) {
      if (!job.usage) continue
      const cost = job.costUsd ?? 0
      add(windows.total, job.usage, cost)
      const ended = job.endedAt ? Date.parse(job.endedAt) : 0
      if (ended >= fiveHourStart) add(windows.fiveHour, job.usage, cost)
      if (job.endedAt && job.endedAt.slice(0, 10) === todayStr) add(windows.today, job.usage, cost)
    }
    return { rateLimit: this.lastRateLimit ?? null, windows }
  }
```

Ensure `RateLimitSnapshot`, `UsageReport`, `UsageBucket`, `JobUsage` are imported at the top of `runner.ts` from `'../../../ui/src/types.js'` (add to the existing type import).

- [ ] **Step 4:** `npx vitest run` (full suite) + `npm run typecheck` green. Adapt test harness mechanics (the `feedLine` helper) without weakening assertions.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/runner.ts server/src/runner.test.ts
git commit -m "feat(board): capture per-job usage + rate-limit snapshot; getUsage aggregation"
```

---

### Task 3: GET /api/usage route (TDD)

**Files:** Modify `server/src/api/routes.ts`; Test: `server/src/routes.test.ts`.

- [ ] **Step 1: Failing test** — append to `server/src/routes.test.ts`:
```ts
it('GET /api/usage returns rateLimit + three buckets', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/usage', cookies: cookie })
  expect(res.statusCode).toBe(200)
  const j = res.json()
  expect('rateLimit' in j).toBe(true)            // null or object
  expect(j.windows).toHaveProperty('fiveHour')
  expect(j.windows).toHaveProperty('today')
  expect(j.windows.total).toHaveProperty('inputTokens')
  expect(j.windows.total).toHaveProperty('jobs')
})
```

- [ ] **Step 2:** Run — FAIL (route missing).

- [ ] **Step 3: Implement** — add next to `GET /api/auto` in `server/src/api/routes.ts`:
```ts
  app.get('/api/usage', () => deps.runner.getUsage())
```

- [ ] **Step 4:** Full suite + typecheck green. Commit:
```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): GET /api/usage"
```

---

### Task 4: UI — UsagePanel in the header

**Files:** Modify `ui/src/api.ts`, `ui/src/App.tsx`, `DESIGN_SYSTEM.md`; Create `ui/src/components/UsagePanel.tsx`.

- [ ] **Step 1: api.ts.** Add `UsageReport` to the type import from `./types.js` and:
```ts
  getUsage: () => request<UsageReport>('/api/usage'),
```

- [ ] **Step 2: UsagePanel.** Create `ui/src/components/UsagePanel.tsx` (verify token classes against `ui/src/index.css` — `bg-surface`, `border-border`, `text-text-*`, `text-ok`, `text-danger`, `text-accent` exist; substitute if any differ):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import type { UsageReport } from '../types.js'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function countdown(resetsAt: number, now: number): string {
  const s = Math.max(0, resetsAt - Math.floor(now / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function UsagePanel({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => { api.getUsage().then(setUsage).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  if (!usage) return null
  const rl = usage.rateLimit
  const fh = usage.windows.fiveHour
  const tot = usage.windows.total
  const ok = !rl || rl.status === 'allowed'
  const tone = ok ? 'text-ok' : 'text-danger'

  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">Gói AI</span>
        {rl ? (
          <>
            <span className={`rounded-full border border-current px-1.5 py-0.5 font-mono text-[9px] uppercase ${tone}`}>{rl.status}{rl.isUsingOverage ? ' · overage' : ''}</span>
            <span className="text-text-secondary">reset {countdown(rl.resetsAt, now)} ({rl.rateLimitType})</span>
          </>
        ) : <span className="text-text-muted">chưa có dữ liệu</span>}
      </div>
      <div className="text-text-secondary" title={`cache read ${fmt(fh.cacheReadTokens)} · cache create ${fmt(fh.cacheCreationTokens)}`}>
        5h: <span className="text-text-primary">{fmt(fh.inputTokens + fh.outputTokens)} tok</span>
        <span className="text-text-muted" title="tham khảo theo giá API — không phải tiền thật"> · ${fh.costUsd.toFixed(2)}</span>
        <span className="text-text-muted"> · tổng {fmt(tot.inputTokens + tot.outputTokens)} tok ({tot.jobs} job)</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount in App.** In `ui/src/App.tsx`, `import { UsagePanel } from './components/UsagePanel.js'` and render `<UsagePanel refreshKey={snapshot.jobs.length} />` in the header row (e.g. after `SettingsPanel`). Keep existing header content.

- [ ] **Step 4: DESIGN_SYSTEM.md.** Note the usage panel: rate-limit status pill + reset countdown + token/cost roll-ups, and that `$` is informational (not real billing).

- [ ] **Step 5: Gates.** From the tool dir: `npm run typecheck` clean; `npx vite build ui` succeeds; `npx vitest run` green; grep-gate clean:
```bash
grep -rnE '(zinc|cyan|red|green|orange|rose|amber|slate|gray|neutral|stone|emerald|teal|sky|blue|indigo|violet|purple|fuchsia|pink|lime|yellow)-[0-9]' ui/src && echo GREP-DIRTY || echo GREP-CLEAN
```

- [ ] **Step 6: Commit.**
```bash
git add ui/src/api.ts ui/src/components/UsagePanel.tsx ui/src/App.tsx DESIGN_SYSTEM.md
git commit -m "feat(board-ui): usage panel (rate-limit status + reset countdown + token rollups)"
```

---

### Task 5: deploy 0.23.0 + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.23.0`; commit `chore(jd): bump plugin to 0.23.0 (usage panel)`. Then `git checkout main && git merge --no-ff usage-panel && git branch -d usage-panel && git push origin main`.

- [ ] **Step 3: Build dist + restart — ONLY when no jobs are running.** Check `curl -s http://127.0.0.1:4400/api/board` for `running`/`queued`; if present, wait. Then kill the running `dist/server/src/index.js`, `npm run build`, relaunch `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`.

- [ ] **Step 4: Prove.**
  - `curl -s http://127.0.0.1:4400/api/usage` → `{ rateLimit: …|null, windows: { fiveHour, today, total } }`.
  - If prior job logs carried usage, `total.jobs` ≥ 1; on a fresh board it may be zeroed with `rateLimit: null` until the next job runs — note that the panel populates as jobs run.
  - In the UI: the "Gói AI" panel shows in the header; once a job runs it shows the rate-limit status + a ticking reset countdown + token roll-ups.

---

## Self-review notes

- Spec coverage: parse rate_limit_event + result usage (T1), capture per-job usage/cost + latest snapshot persisted to usage.json + aggregation over 5h/today/total (T2), GET /api/usage (T3), UsagePanel with status pill + client-side reset countdown + token/cost roll-ups + informational-$ label (T4), deploy (T5).
- Type consistency: `JobUsage`/`RateLimitSnapshot`/`UsageBucket`/`UsageReport` defined in `ui/src/types.ts`, used by events (`usage` on `turn_result`, `rate_limit` event), runner (capture + `getUsage`), route, api, and `UsagePanel`. `Job` gains `usage`/`costUsd`.
- Data integrity: aggregation reads `this.jobs` which `recoverInterrupted` populates from all persisted job files on boot → totals survive restart (minus cleared jobs). Jobs without a `result` (interrupted) have no `usage` and are excluded. `resetsAt` is absolute so a loaded snapshot stays correct across restart.
- Honesty: `$` labelled informational; panel scoped to the board's own jobs; no claim of a precise plan limit (not available).
- Safety: display-only; no dispatch gating on a budget (explicitly out of scope). `usage.json` is gitignored (whole `data/` excluded in gamesync; for the skill's generic setup add `usage.json` next to the `auto.json` ignore — follow-up, not needed for gamesync).
