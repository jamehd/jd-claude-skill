# Project Board Job Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live per-job console — watch the running Claude session as structured streaming events and message it back (queue / interrupt-and-steer / continue-after-finish), per spec `docs/superpowers/specs/2026-06-11-project-board-job-console-design.md`.

**Architecture:** Jobs become chains of `claude -p` segments sharing one Claude session (`--resume`) and one worktree. The runner parses `--output-format stream-json` NDJSON through a pure normalizer into board-owned `ConsoleEvent`s (broadcast over WS + replayable from the raw log). A shared `ConsoleView` renders the stream in an overlay and at `/console/:jobId`.

**Tech Stack:** existing Fastify/React/Aurora stack; no new dependencies.

**Repo:** ALL code work in `/home/gamesync/source/jd-claude-skill` on a new branch `job-console`, tool dir `plugins/jd/tools/project-board`. Paths below are relative to the tool dir. Spec + `DESIGN_SYSTEM.md` are authoritative.

**Schema refinement vs spec (approved):** `note` events carry `noteType: 'user_message' | 'steer' | 'queued' | 'error' | 'info'` so server strings stay English/neutral and the UI renders Vietnamese labels. `normalizeLine` returns `ConsoleEvent[]` (a claude line can contain several tool_use blocks).

**Accepted deviation:** continue-after-finish starts immediately regardless of `maxConcurrent` (owner-initiated, rare); its chain gets a fresh timeout budget.

---

## File structure

```
server/src/jobs/events.ts        # NEW pure normalizer: NDJSON line -> ConsoleEvent[]
server/src/jobs/runner.ts        # REWRITE: segment chains, message(), session capture
server/src/jobs/git.ts           # + hasWorktree()
server/src/api/routes.ts         # + GET /api/jobs/:id/events, POST /api/jobs/:id/message
server/src/server.ts             # + SPA catch-all (config.uiDistDir override)
server/src/config.ts             # + uiDistDir?: string
ui/src/types.ts                  # + ConsoleEvent, NoteType; Job.sessionId/segments; WsMessage job_event
ui/src/useBoard.ts               # job_event handling: preview map + per-job listener registry
ui/src/components/ConsoleView.tsx  # NEW shared console (overlay + page)
ui/src/components/ConsolePage.tsx  # NEW /console/:jobId mount
ui/src/components/ActivityPanel.tsx# preview + "Mở console" button
ui/src/components/TaskDrawer.tsx   # "Mở console" when item.job exists
ui/src/App.tsx                   # pathname routing + overlay state
DESIGN_SYSTEM.md                 # + Console recipe
```

---

### Task 1: Types + event normalizer (TDD)

**Files:**
- Modify: `ui/src/types.ts`
- Create: `server/src/jobs/events.ts`
- Test: `server/src/events.test.ts`

- [ ] **Step 1: Extend types.** In `ui/src/types.ts` add after the `Job` interface (and add the two optional fields to `Job` itself):

```ts
// add to interface Job:
//   sessionId?: string
//   segments?: number

export type NoteType = 'user_message' | 'steer' | 'queued' | 'error' | 'info'

export type ConsoleEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_start'; toolId: string; tool: string; inputPreview: string }
  | { kind: 'tool_result'; toolId: string; output: string; isError: boolean }
  | { kind: 'turn_result'; ok: boolean; durationMs?: number; costUsd?: number }
  | { kind: 'note'; noteType: NoteType; text: string }
  | { kind: 'raw'; text: string }
```

and extend `WsMessage` (KEEP `job_log` for now — removed in Task 4):

```ts
export type WsMessage =
  | { type: 'board_update' }
  | { type: 'job_log'; jobId: string; line: string }
  | { type: 'job_event'; jobId: string; event: ConsoleEvent }
```

- [ ] **Step 2: Failing tests** `server/src/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeLine } from './jobs/events.js'

describe('normalizeLine', () => {
  it('maps system init', () => {
    expect(normalizeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-1', model: 'claude-x' })))
      .toEqual([{ kind: 'init', sessionId: 's-1', model: 'claude-x' }])
  })
  it('maps text deltas from stream events', () => {
    expect(normalizeLine(JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
    }))).toEqual([{ kind: 'text_delta', text: 'hello' }])
  })
  it('ignores non-text stream events', () => {
    expect(normalizeLine(JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } }))).toEqual([])
  })
  it('maps every tool_use block in an assistant message', () => {
    const events = normalizeLine(JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'running' },
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/x' } },
      ] },
    }))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ kind: 'tool_start', toolId: 't1', tool: 'Bash' })
    expect(events[1]).toMatchObject({ kind: 'tool_start', toolId: 't2', tool: 'Read' })
  })
  it('maps tool results from user messages', () => {
    expect(normalizeLine(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok', is_error: false }] },
    }))).toEqual([{ kind: 'tool_result', toolId: 't1', output: 'ok', isError: false }])
  })
  it('maps result events', () => {
    expect(normalizeLine(JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1200, total_cost_usd: 0.05 })))
      .toEqual([{ kind: 'turn_result', ok: true, durationMs: 1200, costUsd: 0.05 }])
  })
  it('maps board note lines and raw board lines', () => {
    expect(normalizeLine(JSON.stringify({ _board: 'user_message', text: 'do X' })))
      .toEqual([{ kind: 'note', noteType: 'user_message', text: 'do X' }])
    expect(normalizeLine(JSON.stringify({ _board: 'raw', text: 'stderr junk' })))
      .toEqual([{ kind: 'raw', text: 'stderr junk' }])
  })
  it('falls back to raw for unparseable lines and never throws', () => {
    expect(normalizeLine('not json at all')).toEqual([{ kind: 'raw', text: 'not json at all' }])
    expect(normalizeLine(JSON.stringify({ type: 'mystery' }))).toEqual([])
  })
  it('truncates oversized tool previews/outputs', () => {
    const big = 'x'.repeat(10_000)
    const [start] = normalizeLine(JSON.stringify({
      type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { c: big } }] },
    }))
    expect((start as { inputPreview: string }).inputPreview.length).toBeLessThanOrEqual(200)
    const [res] = normalizeLine(JSON.stringify({
      type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: big, is_error: true }] },
    }))
    expect((res as { output: string }).output.length).toBeLessThanOrEqual(4000)
    expect((res as { isError: boolean }).isError).toBe(true)
  })
})
```

- [ ] **Step 3:** Run `npx vitest run server/src/events.test.ts` — FAIL (module missing).

- [ ] **Step 4: Implement** `server/src/jobs/events.ts`:

```ts
import type { ConsoleEvent, NoteType } from '../../../ui/src/types.js'

const NOTE_TYPES: NoteType[] = ['user_message', 'steer', 'queued', 'error', 'info']

function preview(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return s.length > max ? s.slice(0, max) : s
}

export function normalizeLine(line: string): ConsoleEvent[] {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(line) as Record<string, unknown>
  } catch {
    return [{ kind: 'raw', text: line }]
  }
  if (typeof o !== 'object' || o === null) return [{ kind: 'raw', text: line }]

  if (typeof o._board === 'string') {
    if (o._board === 'raw') return [{ kind: 'raw', text: String(o.text ?? '') }]
    const noteType = (NOTE_TYPES as string[]).includes(o._board) ? (o._board as NoteType) : 'info'
    return [{ kind: 'note', noteType, text: String(o.text ?? '') }]
  }

  const msg = (o.message ?? {}) as { content?: unknown }

  if (o.type === 'system' && o.subtype === 'init') {
    return [{ kind: 'init', sessionId: String(o.session_id ?? ''), model: String(o.model ?? '') }]
  }
  if (o.type === 'stream_event') {
    const ev = o.event as { type?: string; delta?: { type?: string; text?: string } } | undefined
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      return [{ kind: 'text_delta', text: ev.delta.text ?? '' }]
    }
    return []
  }
  if (o.type === 'assistant' && Array.isArray(msg.content)) {
    return (msg.content as Record<string, unknown>[])
      .filter((b) => b?.type === 'tool_use')
      .map((b) => ({
        kind: 'tool_start' as const,
        toolId: String(b.id ?? ''),
        tool: String(b.name ?? ''),
        inputPreview: preview(b.input, 200),
      }))
  }
  if (o.type === 'user' && Array.isArray(msg.content)) {
    return (msg.content as Record<string, unknown>[])
      .filter((b) => b?.type === 'tool_result')
      .map((b) => ({
        kind: 'tool_result' as const,
        toolId: String(b.tool_use_id ?? ''),
        output: preview(b.content, 4000),
        isError: Boolean(b.is_error),
      }))
  }
  if (o.type === 'result') {
    return [{
      kind: 'turn_result',
      ok: o.subtype === 'success',
      durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : undefined,
      costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
    }]
  }
  return []
}
```

- [ ] **Step 5:** Tests PASS (9). Full suite (74 = 65 + 9) + `npm run typecheck` green.
- [ ] **Step 6:** Commit: `feat(board): console event types and stream-json normalizer`

---

### Task 2: Runner rewrite — segment chains, message(), session capture (TDD)

**Files:**
- Modify: `server/src/jobs/git.ts` (+hasWorktree)
- Rewrite: `server/src/jobs/runner.ts`
- Modify: `server/src/runner.test.ts` (upgrade fakes + new tests)
- Modify: `server/src/test-helpers.ts` (fake git +hasWorktree)
- Test additions: `server/src/git.test.ts` (hasWorktree)

- [ ] **Step 1: hasWorktree.** In `git.ts` add to `BoardGit` (import `existsSync` from `node:fs`):

```ts
  hasWorktree(taskId: string): boolean {
    this.assertSafeId(taskId)
    return existsSync(this.worktreePath(taskId))
  }
```

Add to `git.test.ts`:

```ts
  it('hasWorktree reflects existence', () => {
    expect(git.hasWorktree('TASK-010')).toBe(false)
    git.createWorktree('TASK-010')
    expect(git.hasWorktree('TASK-010')).toBe(true)
    git.removeWorktree('TASK-010')
    expect(git.hasWorktree('TASK-010')).toBe(false)
  })
```

Extend the `GitOps` interface in `runner.ts` (Step 3) with `hasWorktree(taskId: string): boolean`, and add `hasWorktree: () => true` to the fake git objects in `test-helpers.ts` and `runner.test.ts` (`vi.fn(() => true)` in the latter).

- [ ] **Step 2: Upgrade runner test harness + add failing tests.** In `runner.test.ts`:

Replace `FakeProc` and `setup()` so every spawn produces a fresh proc and argv is captured:

```ts
class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill() { this.killed = true; this.emit('exit', 143) }
}

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
  for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
  const store = new BoardStore(dataDir)
  const item = store.createItem({ type: 'task', title: 'Do work', component: 'infra' })
  store.updateItem(item.id, { status: 'ready' })

  const procs: FakeProc[] = []
  const spawnCalls: string[][] = []
  const spawnFn: SpawnFn = vi.fn((_bin, args) => {
    spawnCalls.push(args)
    const p = new FakeProc()
    procs.push(p)
    return p as never
  })
  const git: GitOps = {
    createWorktree: vi.fn(() => path.join(dataDir, 'wt')),
    removeWorktree: vi.fn(),
    changedFiles: vi.fn(() => []),
    branchDiff: vi.fn(() => ''),
    mergeBranch: vi.fn(),
    createPr: vi.fn(() => ''),
    hasWorktree: vi.fn(() => true),
  }
  const runner = new JobRunner({
    store, hub: new WsHub(), git, spawnFn,
    jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 5000, maxConcurrent: 1,
  })
  const sendInit = (i = 0, session = 'sess-1') =>
    procs[i].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: session }) + '\n'))
  return { store, runner, git, spawnFn, spawnCalls, item, procs, sendInit, dataDir }
}
```

NOTE: `timeoutMs` rises from 50 to 5000 — the old timeout test must instead build its own runner with `timeoutMs: 50` (see below). Adapt existing tests minimally: where they did `t.proc()` use `t.procs[0]`; the happy-path/`exit 0` flows must call `t.sendInit()` first only where session capture is asserted (others work without it).

New tests to add:

```ts
  it('uses stream-json args and captures the session id', () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    expect(t.spawnCalls[0]).toEqual(expect.arrayContaining([
      '-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    ]))
    expect(t.spawnCalls[0]).not.toContain('--resume')
    t.sendInit()
    expect(t.runner.getJob(job.id)?.sessionId).toBe('sess-1')
    expect(t.runner.getJob(job.id)?.segments).toBe(1)
  })

  it('queued message chains a resume segment instead of finishing', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.runner.message(job.id, 'also update the docs', 'queue')
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.spawnCalls).toHaveLength(2))
    expect(t.runner.getJob(job.id)?.state).toBe('running')
    expect(t.spawnCalls[1]).toEqual(expect.arrayContaining(['-p', 'also update the docs', '--resume', 'sess-1']))
    t.procs[1].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    expect(t.runner.getJob(job.id)?.segments).toBe(2)
  })

  it('steer kills the segment and chains immediately', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.runner.message(job.id, 'stop, do Y instead', 'steer')
    await vi.waitFor(() => expect(t.spawnCalls).toHaveLength(2))
    expect(t.procs[0].killed).toBe(true)
    expect(t.runner.getJob(job.id)?.state).toBe('running')
    expect(t.spawnCalls[1]).toEqual(expect.arrayContaining(['--resume', 'sess-1']))
  })

  it('steer before session id is captured degrades to queue', () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.runner.message(job.id, 'early steer', 'steer')
    expect(t.procs[0].killed).toBe(false)
    expect(t.spawnCalls).toHaveLength(1)
    t.sendInit()
    t.procs[0].emit('exit', 0)
    return vi.waitFor(() => expect(t.spawnCalls).toHaveLength(2))
  })

  it('segment failure discards the queue and fails the job', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.runner.message(job.id, 'queued thing', 'queue')
    t.procs[0].emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    expect(t.spawnCalls).toHaveLength(1)
  })

  it('continue-after-finish resumes a succeeded job and re-runs review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    expect(t.store.getItem(t.item.id)?.status).toBe('review')
    t.runner.message(job.id, 'please also add tests', 'queue')
    expect(t.runner.getJob(job.id)?.state).toBe('running')
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')
    await vi.waitFor(() => expect(t.spawnCalls).toHaveLength(2))
    t.procs[1].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    expect(t.store.getItem(t.item.id)?.status).toBe('review')
  })

  it('continue-after-finish 409s when the worktree is gone', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    expect(() => t.runner.message(job.id, 'more', 'queue')).toThrow(/worktree no longer exists/)
  })

  it('messaging a cancelled job throws', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.runner.cancel(job.id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('cancelled'))
    expect(() => t.runner.message(job.id, 'hi', 'queue')).toThrow(/cancelled/)
  })

  it('timeout budget spans segments', async () => {
    // dedicated runner with a tiny timeout
    const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
    for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
    const store = new BoardStore(dataDir)
    const item = store.createItem({ type: 'task', title: 'T', component: 'infra' })
    store.updateItem(item.id, { status: 'ready' })
    const procs: FakeProc[] = []
    const runner = new JobRunner({
      store, hub: new WsHub(),
      git: { createWorktree: () => dataDir, removeWorktree: () => {}, changedFiles: () => [],
             branchDiff: () => '', mergeBranch: () => {}, createPr: () => '', hasWorktree: () => true },
      spawnFn: () => { const p = new FakeProc(); procs.push(p); return p as never },
      jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 80, maxConcurrent: 1,
    })
    const job = runner.dispatchTask(item.id)
    procs[0].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }) + '\n'))
    runner.message(job.id, 'next', 'queue')
    procs[0].emit('exit', 0) // chains segment 2; timer NOT re-armed
    await vi.waitFor(() => expect(runner.getJob(job.id)?.state).toBe('failed'), { timeout: 2000 })
    expect(procs[1].killed).toBe(true)
    expect(runner.getJob(job.id)?.error).toMatch(/timeout/)
  })
```

Also adjust the OLD timeout test ("kills the process on timeout") to construct its own tiny-timeout runner the same way (the shared setup now uses 5000ms), and the OLD "writes a log file" test asserts the log contains the emitted line (now NDJSON-ish content — emit a plain text chunk `'working...\n'`; it lands in the log verbatim and normalizes to `raw`).

- [ ] **Step 3:** Run — new tests FAIL. **Rewrite `server/src/jobs/runner.ts`** in full:

```ts
import { appendFileSync, writeFileSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { BoardStore } from '../store.js'
import type { WsHub } from '../ws.js'
import type { ConsoleEvent, Job, JobKind, NoteType } from '../../../ui/src/types.js'
import { buildTaskPrompt, buildRescanPrompt } from './prompt.js'
import { normalizeLine } from './events.js'

export type SpawnFn = (bin: string, args: string[], opts: { cwd: string }) => ChildProcess

export interface GitOps {
  createWorktree(taskId: string): string
  removeWorktree(taskId: string): void
  changedFiles(taskId: string): string[]
  branchDiff(taskId: string): string
  mergeBranch(taskId: string, message: string): void
  createPr(taskId: string, title: string, body: string): string
  hasWorktree(taskId: string): boolean
}

export interface RunnerDeps {
  store: BoardStore
  hub: WsHub
  git: GitOps
  jobsDir: string
  claudeBin: string
  timeoutMs: number
  maxConcurrent: number
  spawnFn?: SpawnFn
}

export const RESCAN_ID = 'RESCAN'

interface SegmentEntry {
  proc: ChildProcess
  steering: boolean
  steerMessage?: string
  buffer: string
}

export class JobRunner {
  private jobs = new Map<string, Job>()
  private dispatchQueue: Job[] = []
  private running = new Map<string, SegmentEntry>()
  private messages = new Map<string, string[]>()
  private timers = new Map<string, NodeJS.Timeout>()
  private cwds = new Map<string, string>()
  private spawnFn: SpawnFn

  constructor(private deps?: RunnerDeps) {
    this.spawnFn = deps?.spawnFn ?? spawn
    if (deps) this.recoverInterrupted()
  }

  listJobs(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.id.localeCompare(a.id))
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  dispatchTask(taskId: string): Job {
    if (this.hasActiveJob((j) => j.kind === 'task' && j.taskId === taskId)) {
      throw new Error(`task ${taskId} already has an active job`)
    }
    return this.enqueue('task', taskId)
  }

  dispatchRescan(): Job {
    if (this.hasActiveJob((j) => j.kind === 'rescan')) {
      throw new Error('rescan already running')
    }
    return this.enqueue('rescan', undefined)
  }

  message(jobId: string, text: string, mode: 'queue' | 'steer'): void {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`job not found: ${jobId}`)
    if (job.state === 'cancelled') throw new Error('job was cancelled; session is closed')
    if (job.state === 'queued') throw new Error('job has not started yet')

    if (job.state === 'running') {
      this.note(job, 'user_message', text)
      const entry = this.running.get(jobId)
      if (mode === 'steer' && entry && job.sessionId) {
        entry.steering = true
        entry.steerMessage = text
        this.note(job, 'steer', 'interrupting current turn')
        entry.proc.kill('SIGTERM')
      } else {
        if (mode === 'steer') this.note(job, 'queued', 'session not ready to steer; message queued')
        this.pendingOf(jobId).push(text)
      }
      return
    }

    // succeeded | failed | interrupted -> continue-after-finish
    if (!job.sessionId) throw new Error('no session recorded for this job')
    const wtId = job.kind === 'task' ? job.taskId! : RESCAN_ID
    if (!this.deps!.git.hasWorktree(wtId)) {
      throw new Error('worktree no longer exists; session is read-only')
    }
    job.state = 'running'
    job.error = undefined
    job.endedAt = undefined
    this.persist(job)
    if (job.kind === 'task') {
      const item = this.deps!.store.getItem(job.taskId!)
      if (item && item.status !== 'ai_running') {
        this.deps!.store.updateItem(item.id, { status: 'ai_running', job: job.id })
      }
    }
    this.note(job, 'user_message', text)
    this.armTimer(job)
    this.startSegment(job, text, job.sessionId)
    this.deps!.hub.broadcast({ type: 'board_update' })
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.state === 'queued') {
      this.dispatchQueue = this.dispatchQueue.filter((j) => j.id !== jobId)
      this.finish(job, 'cancelled', 'cancelled while queued')
      return
    }
    if (job.state !== 'running') return
    job.state = 'cancelled'
    this.persist(job)
    this.running.get(jobId)?.proc.kill('SIGTERM')
  }

  shutdown(): void {
    for (const [jobId, entry] of this.running) {
      const job = this.jobs.get(jobId)
      if (job) {
        job.state = 'interrupted'
        job.error = 'server shutting down; worktree kept for inspection'
        this.persist(job)
      }
      entry.proc.kill('SIGTERM')
    }
  }

  private hasActiveJob(match: (j: Job) => boolean): boolean {
    return [...this.jobs.values()].some((j) => (j.state === 'queued' || j.state === 'running') && match(j))
  }

  private pendingOf(jobId: string): string[] {
    let q = this.messages.get(jobId)
    if (!q) { q = []; this.messages.set(jobId, q) }
    return q
  }

  private logFile(job: Job): string {
    return path.join(this.deps!.jobsDir, `${job.id}.log`)
  }

  private emit(job: Job, event: ConsoleEvent): void {
    this.deps!.hub.broadcast({ type: 'job_event', jobId: job.id, event })
  }

  private note(job: Job, noteType: NoteType, text: string): void {
    appendFileSync(this.logFile(job), JSON.stringify({ _board: noteType, text }) + '\n')
    this.emit(job, { kind: 'note', noteType, text })
  }

  private enqueue(kind: JobKind, taskId?: string): Job {
    const job: Job = { id: this.nextJobId(), kind, taskId, state: 'queued' }
    this.jobs.set(job.id, job)
    this.persist(job)
    this.dispatchQueue.push(job)
    this.pump()
    return job
  }

  private pump(): void {
    if (!this.deps) return
    while (this.running.size < this.deps.maxConcurrent && this.dispatchQueue.length > 0) {
      this.start(this.dispatchQueue.shift()!)
    }
  }

  private start(job: Job): void {
    const { store, git, hub } = this.deps!
    const wtId = job.kind === 'task' ? job.taskId! : RESCAN_ID
    job.branch = `board/${wtId}`
    job.startedAt = new Date().toISOString()
    job.state = 'running'

    let cwd: string
    try {
      cwd = git.createWorktree(wtId)
    } catch (err) {
      this.finish(job, 'failed', `worktree: ${err instanceof Error ? err.message : err}`)
      return
    }
    this.cwds.set(job.id, cwd)

    let prompt: string
    if (job.kind === 'task') {
      const item = store.getItem(job.taskId!)
      if (!item) {
        git.removeWorktree(wtId)
        this.finish(job, 'failed', `task not found: ${job.taskId}`)
        return
      }
      store.updateItem(item.id, { status: 'ai_running', job: job.id })
      prompt = buildTaskPrompt(item)
    } else {
      prompt = buildRescanPrompt()
    }
    this.persist(job)
    hub.broadcast({ type: 'board_update' })
    this.armTimer(job)
    this.startSegment(job, prompt, undefined)
  }

  private startSegment(job: Job, promptText: string, resume?: string): void {
    const { claudeBin } = this.deps!
    const cwd = this.cwds.get(job.id)
    if (!cwd) {
      this.finish(job, 'failed', 'worktree path lost (server restarted?); session is read-only')
      return
    }
    job.segments = (job.segments ?? 0) + 1
    this.persist(job)

    const args = ['-p', promptText, '--dangerously-skip-permissions',
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (resume) args.push('--resume', resume)

    const proc = this.spawnFn(claudeBin, args, { cwd })
    const entry: SegmentEntry = { proc, steering: false, buffer: '' }
    this.running.set(job.id, entry)

    proc.stdout?.on('data', (chunk: Buffer) => this.onStdout(job, entry, chunk))
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      appendFileSync(this.logFile(job), JSON.stringify({ _board: 'raw', text }) + '\n')
      this.emit(job, { kind: 'raw', text })
    })
    proc.on('exit', (code) => this.onSegmentExit(job, entry, code))
  }

  private onStdout(job: Job, entry: SegmentEntry, chunk: Buffer): void {
    entry.buffer += chunk.toString()
    let idx: number
    while ((idx = entry.buffer.indexOf('\n')) >= 0) {
      const line = entry.buffer.slice(0, idx)
      entry.buffer = entry.buffer.slice(idx + 1)
      this.handleLine(job, line)
    }
  }

  private handleLine(job: Job, line: string): void {
    if (!line.trim()) return
    appendFileSync(this.logFile(job), line + '\n')
    for (const event of normalizeLine(line)) {
      if (event.kind === 'init' && !job.sessionId) {
        job.sessionId = event.sessionId
        this.persist(job)
      }
      this.emit(job, event)
    }
  }

  private onSegmentExit(job: Job, entry: SegmentEntry, code: number | null): void {
    if (this.running.get(job.id) !== entry) return
    this.running.delete(job.id)
    if (entry.buffer.trim()) {
      this.handleLine(job, entry.buffer)
      entry.buffer = ''
    }

    if (entry.steering) {
      this.startSegment(job, entry.steerMessage!, job.sessionId)
      return
    }
    if (job.state === 'cancelled' || job.state === 'interrupted') {
      this.clearTimer(job.id)
      this.messages.delete(job.id)
      this.afterFailure(job, job.state === 'cancelled' ? 'cancelled by user' : 'server shutdown')
      this.finishKeepState(job)
      this.pump()
      return
    }
    if (job.error) {
      this.clearTimer(job.id)
      this.discardQueue(job)
      this.afterFailure(job, job.error)
      this.finish(job, 'failed', job.error)
      this.pump()
      return
    }
    if (code !== 0) {
      this.clearTimer(job.id)
      this.discardQueue(job)
      this.afterFailure(job, `claude exited with code ${code}`)
      this.finish(job, 'failed', `exit code ${code}`)
      this.pump()
      return
    }
    const pending = this.messages.get(job.id)
    if (pending && pending.length > 0) {
      const next = pending.shift()!
      this.startSegment(job, next, job.sessionId)
      return
    }
    this.clearTimer(job.id)
    if (this.completedSuccessfully(job)) {
      if (job.kind === 'task') this.afterSuccess(job)
      this.finish(job, 'succeeded')
    } else {
      const reason = job.kind === 'task'
        ? 'process exited 0 but no commits found on the branch'
        : 'process exited 0 but no files under project-board/data/status changed'
      this.afterFailure(job, reason)
      this.finish(job, 'failed', reason)
    }
    this.pump()
  }

  private discardQueue(job: Job): void {
    const q = this.messages.get(job.id)
    if (q && q.length > 0) this.note(job, 'error', `${q.length} queued message(s) discarded`)
    this.messages.delete(job.id)
  }

  private armTimer(job: Job): void {
    this.clearTimer(job.id)
    const t = setTimeout(() => {
      job.error = `timeout after ${this.deps!.timeoutMs}ms`
      this.running.get(job.id)?.proc.kill('SIGTERM')
    }, this.deps!.timeoutMs)
    this.timers.set(job.id, t)
  }

  private clearTimer(jobId: string): void {
    const t = this.timers.get(jobId)
    if (t) clearTimeout(t)
    this.timers.delete(jobId)
  }

  private completedSuccessfully(job: Job): boolean {
    const { git } = this.deps!
    if (job.kind === 'task') {
      return git.changedFiles(job.taskId!).length > 0
    }
    return git.changedFiles(RESCAN_ID).some((f) => f.startsWith('project-board/data/status/'))
  }

  private afterSuccess(job: Job): void {
    const { store, git } = this.deps!
    try {
      store.updateItem(job.taskId!, { status: 'review' })
      store.appendToBody(job.taskId!,
        `## AI result\nJob ${job.id} succeeded on branch board/${job.taskId}.\nChanged files:\n${git.changedFiles(job.taskId!).map((f) => `- ${f}`).join('\n')}\nFull output: data/jobs/${job.id}.log`)
    } catch (err) {
      job.error = `task file could not be updated: ${err instanceof Error ? err.message : err}`
    }
  }

  private afterFailure(job: Job, reason: string): void {
    const { store } = this.deps!
    if (job.kind !== 'task') return
    try {
      store.updateItem(job.taskId!, { status: 'ready' })
      store.appendToBody(job.taskId!, `## AI result\nJob ${job.id} failed: ${reason}\nWorktree/branch kept for inspection: board/${job.taskId}`)
    } catch { /* task file may be unparseable after a bad edit; job error is still recorded */ }
  }

  private finish(job: Job, state: Job['state'], error?: string): void {
    job.state = state
    if (error) job.error = error
    this.finishKeepState(job)
  }

  private finishKeepState(job: Job): void {
    job.endedAt = new Date().toISOString()
    this.persist(job)
    this.deps?.hub.broadcast({ type: 'board_update' })
  }

  private persist(job: Job): void {
    if (!this.deps) return
    const file = path.join(this.deps.jobsDir, `${job.id}.json`)
    writeFileSync(`${file}.tmp`, JSON.stringify(job, null, 2))
    renameSync(`${file}.tmp`, file)
  }

  private nextJobId(): string {
    const nums = [...this.jobs.keys()].map((id) => Number(id.split('-')[1]))
    if (this.deps) {
      for (const f of readdirSync(this.deps.jobsDir)) {
        const m = f.match(/^job-(\d+)\.json$/)
        if (m) nums.push(Number(m[1]))
      }
    }
    return `job-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
  }

  private recoverInterrupted(): void {
    const { jobsDir, store } = this.deps!
    for (const f of readdirSync(jobsDir).filter((f) => f.endsWith('.json'))) {
      let job: Job
      try {
        job = JSON.parse(readFileSync(path.join(jobsDir, f), 'utf8')) as Job
      } catch {
        try { renameSync(path.join(jobsDir, f), path.join(jobsDir, `${f}.corrupt`)) } catch { /* best effort */ }
        continue
      }
      if (job.state === 'running' || job.state === 'queued') {
        job.state = 'interrupted'
        job.error = 'server restarted mid-job; worktree kept for inspection'
        if (job.kind === 'task' && job.taskId && store.getItem(job.taskId)?.status === 'ai_running') {
          store.updateItem(job.taskId, { status: 'ready' })
        }
        this.persist(job)
      }
      this.jobs.set(job.id, job)
    }
  }
}
```

IMPORTANT preservation notes:
- Keep `buildTaskPrompt(item)` single-arg (current signature).
- `cwds` is in-memory: after a server restart a continue-after-finish hits the `worktree path lost` guard in `startSegment`. To honor the spec ("interrupted job offers Tiếp tục phiên"), `message()`'s continue path must REPOPULATE cwd before `startSegment`: insert `if (!this.cwds.has(job.id)) this.cwds.set(job.id, this.deps!.git.createWorktree === undefined ? '' : path.join(this.repoRootOf()))` — NO. The clean way: derive from git: add to the continue path, right before `this.armTimer(job)`:

```ts
    if (!this.cwds.has(job.id)) {
      this.cwds.set(job.id, this.worktreePathOf(wtId))
    }
```

with a small helper added to `GitOps`: `worktreePath(taskId: string): string` (BoardGit already HAS a public `worktreePath` — just add it to the interface and to both fakes: `worktreePath: (id) => path.join(dataDir, 'wt')` in tests). Include this in Step 1's interface extension (so: `hasWorktree` AND `worktreePath` join `GitOps`).

- [ ] **Step 4:** Run the full suite + typecheck. Expected: all green (74 + new runner tests ≈ 83 total; exact count reported by vitest). Fix only test-harness drift, never weaken assertions.
- [ ] **Step 5:** Commit: `feat(board): segment-chained job runner with queue/steer/continue messaging`

---

### Task 3: Routes — events replay, message, SPA catch-all (TDD)

**Files:**
- Modify: `server/src/api/routes.ts`
- Modify: `server/src/server.ts` (+catch-all), `server/src/config.ts` (+uiDistDir)
- Modify: `server/src/test-helpers.ts` (fake git: + `worktreePath`, `hasWorktree`)
- Modify: `server/src/routes.test.ts`

- [ ] **Step 1: config.** Add to `Config`: `uiDistDir?: string`; in `loadConfig` add `uiDistDir: env.BOARD_UI_DIST` (optional). In `server.ts` replace the `uiDist` computation with `const uiDist = deps.config.uiDistDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ui/dist')`.

- [ ] **Step 2: failing route tests** (append to `routes.test.ts`):

```ts
describe('console routes', () => {
  async function dispatched(): Promise<{ jobId: string }> {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'ready' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    return { jobId: res.json().id }
  }

  it('replays normalized events from the log', async () => {
    const { jobId } = await dispatched()
    await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'hello agent', mode: 'queue' } })
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/events`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    const events = res.json() as { kind: string; text?: string }[]
    expect(events.some((e) => e.kind === 'note' && e.text === 'hello agent')).toBe(true)
  })

  it('validates message payloads', async () => {
    const { jobId } = await dispatched()
    const empty = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: '   ', mode: 'queue' } })
    expect(empty.statusCode).toBe(400)
    const badMode = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'x', mode: 'shout' } })
    expect(badMode.statusCode).toBe(400)
    const missing = await app.inject({ method: 'POST', url: '/api/jobs/job-999/message', cookies: cookie,
      payload: { text: 'x', mode: 'queue' } })
    expect(missing.statusCode).toBe(404)
  })

  it('maps runner conflicts to 409', async () => {
    const { jobId } = await dispatched()
    const cancel = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/cancel`, cookies: cookie })
    expect(cancel.statusCode).toBe(200)
    const res = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'x', mode: 'queue' } })
    expect(res.statusCode).toBe(409)
  })

  it('guards job-id params and 404s unknown event logs', async () => {
    const trav = await app.inject({ method: 'GET', url: '/api/jobs/..%2Fx/events', cookies: cookie })
    expect(trav.statusCode).toBe(404)
    const none = await app.inject({ method: 'GET', url: '/api/jobs/job-999/events', cookies: cookie })
    expect(none.statusCode).toBe(404)
  })

  it('serves the SPA for /console/<id> deep links', async () => {
    const res = await app.inject({ method: 'GET', url: '/console/job-001', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<div id="root">')
  })
})
```

For the SPA test, `makeDeps()` must create a fake ui dist: in `test-helpers.ts`, `mkdirSync(path.join(dataDir, 'uidist'))`, write `index.html` containing `<div id="root"></div>`, and set `uiDistDir: path.join(dataDir, 'uidist')` in the returned config. Cancelled-job messaging relies on the fake proc's `kill()` emitting exit synchronously (existing helper behavior).

- [ ] **Step 3: implement.** In `routes.ts` append (imports: `normalizeLine` from `../jobs/events.js`):

```ts
  app.get<{ Params: { id: string } }>('/api/jobs/:id/events', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const file = path.join(store.jobsDir, `${req.params.id}.log`)
    if (!existsSync(file)) return reply.code(404).send({ error: 'no events' })
    const events = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
      .flatMap((l) => normalizeLine(l))
    return events
  })

  app.post<{ Params: { id: string }; Body: { text?: string; mode?: string } }>('/api/jobs/:id/message', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const text = req.body?.text?.trim()
    const mode = req.body?.mode
    if (!text || (mode !== 'queue' && mode !== 'steer')) {
      return reply.code(400).send({ error: 'text and mode (queue|steer) are required' })
    }
    if (!deps.runner.getJob(req.params.id)) return reply.code(404).send({ error: 'not found' })
    try {
      deps.runner.message(req.params.id, text, mode)
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
  })
```

In `server.ts`, after `registerRoutes(app, deps)` add the catch-all (only when uiDist exists; `existsSync` already imported):

```ts
  const uiIndex = path.join(uiDist, 'index.html')
  if (existsSync(uiIndex)) {
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.type('text/html').send(readFileSync(uiIndex, 'utf8'))
      }
      reply.code(404).send({ error: 'not found' })
    })
  }
```

(import `readFileSync` from `node:fs`; note the auth hook leaves non-/api paths open — the SPA shell is public like the rest of the static assets, the APIs it calls are not.)

- [ ] **Step 4:** Full suite + typecheck green. Commit: `feat(board): console message/events routes and SPA deep links`

---

### Task 4: UI — ConsoleView, routing, integrations

**Files:**
- Modify: `ui/src/types.ts` (REMOVE `job_log` from WsMessage)
- Modify: `ui/src/useBoard.ts`, `ui/src/api.ts`
- Create: `ui/src/components/ConsoleView.tsx`, `ui/src/components/ConsolePage.tsx`
- Modify: `ui/src/components/ActivityPanel.tsx`, `ui/src/components/TaskDrawer.tsx`, `ui/src/App.tsx`
- Modify: `DESIGN_SYSTEM.md` (+Console recipe)

- [ ] **Step 1: types/api.** Remove the `job_log` member from `WsMessage`. In `api.ts` add:

```ts
  jobEvents: (id: string) => request<ConsoleEvent[]>(`/api/jobs/${id}/events`),
  jobMessage: (id: string, text: string, mode: 'queue' | 'steer') =>
    request<{ ok: boolean }>(`/api/jobs/${id}/message`, { method: 'POST', body: JSON.stringify({ text, mode }) }),
```

(import `ConsoleEvent` type.)

- [ ] **Step 2: useBoard.** Replace the `logLines` state with an event preview + listener registry:

```ts
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const listenersRef = useRef(new Map<string, Set<(e: ConsoleEvent) => void>>())

  const subscribe = useCallback((jobId: string, cb: (e: ConsoleEvent) => void) => {
    let set = listenersRef.current.get(jobId)
    if (!set) { set = new Set(); listenersRef.current.set(jobId, set) }
    set.add(cb)
    return () => { set!.delete(cb) }
  }, [])
```

In `ws.onmessage`, replace the `job_log` branch with:

```ts
        if (msg.type === 'job_event') {
          if (msg.event.kind === 'text_delta') {
            setPreviews((prev) => ({ ...prev, [msg.jobId]: ((prev[msg.jobId] ?? '') + msg.event.text).slice(-300) }))
          }
          listenersRef.current.get(msg.jobId)?.forEach((cb) => cb(msg.event))
        }
```

Return `{ snapshot, previews, subscribe, refresh }`.

- [ ] **Step 3: ConsoleView.** Create `ui/src/components/ConsoleView.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import type { ConsoleEvent, Job, NoteType } from '../types.js'

const NOTE_LABEL: Record<NoteType, string> = {
  user_message: 'Bạn', steer: 'Ngắt & chỉ đạo', queued: 'Đã xếp hàng', error: 'Lỗi', info: 'Hệ thống',
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool'; toolId: string; tool: string; inputPreview: string; output?: string; isError?: boolean }
  | { type: 'system'; text: string; tone: 'muted' | 'danger' | 'user' }

function reduceEvents(events: ConsoleEvent[]): Block[] {
  const blocks: Block[] = []
  for (const e of events) {
    if (e.kind === 'text_delta') {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'text') last.text += e.text
      else blocks.push({ type: 'text', text: e.text })
    } else if (e.kind === 'tool_start') {
      blocks.push({ type: 'tool', toolId: e.toolId, tool: e.tool, inputPreview: e.inputPreview })
    } else if (e.kind === 'tool_result') {
      const card = [...blocks].reverse().find((b) => b.type === 'tool' && b.toolId === e.toolId) as
        Extract<Block, { type: 'tool' }> | undefined
      if (card) { card.output = e.output; card.isError = e.isError }
    } else if (e.kind === 'note') {
      blocks.push({ type: 'system', text: `${NOTE_LABEL[e.noteType]}: ${e.text}`,
        tone: e.noteType === 'error' ? 'danger' : e.noteType === 'user_message' ? 'user' : 'muted' })
    } else if (e.kind === 'init') {
      blocks.push({ type: 'system', text: `Phiên ${e.sessionId.slice(0, 8)} · ${e.model}`, tone: 'muted' })
    } else if (e.kind === 'turn_result') {
      const cost = e.costUsd != null ? ` · $${e.costUsd.toFixed(4)}` : ''
      const dur = e.durationMs != null ? ` · ${(e.durationMs / 1000).toFixed(1)}s` : ''
      blocks.push({ type: 'system', text: `Kết thúc lượt (${e.ok ? 'ok' : 'lỗi'})${dur}${cost}`, tone: e.ok ? 'muted' : 'danger' })
    } else if (e.kind === 'raw') {
      blocks.push({ type: 'system', text: e.text, tone: 'muted' })
    }
  }
  return blocks
}

export function ConsoleView({ job, subscribe, onClose, showOpenTab }: {
  job: Job
  subscribe: (jobId: string, cb: (e: ConsoleEvent) => void) => () => void
  onClose?: () => void
  showOpenTab?: boolean
}) {
  const [events, setEvents] = useState<ConsoleEvent[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinned, setPinned] = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api.jobEvents(job.id).then((history) => { if (!cancelled) setEvents(history) }).catch(() => {})
    const unsub = subscribe(job.id, (e) => setEvents((prev) => [...prev, e]))
    return () => { cancelled = true; unsub() }
  }, [job.id, subscribe])

  useEffect(() => {
    if (pinned) streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
  }, [events, pinned])

  const onScroll = useCallback(() => {
    const el = streamRef.current
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }, [])

  async function send(mode: 'queue' | 'steer') {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try { await api.jobMessage(job.id, text.trim(), mode); setText('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const readOnly = job.state === 'cancelled'
  const continuing = job.state !== 'running' && !readOnly
  const blocks = reduceEvents(events)

  return (
    <div className="flex h-full flex-col bg-base">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <span className="font-mono text-[11px] text-text-muted">{job.id}</span>
        <span className="text-sm font-semibold text-text-primary">
          {job.kind === 'rescan' ? 'Re-scan dự án' : job.taskId}
        </span>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-text-secondary">{job.state}</span>
        {job.sessionId && <span className="font-mono text-[10px] text-text-muted">phiên {job.sessionId.slice(0, 8)} · khúc {job.segments ?? 1}</span>}
        <span className="flex-1" />
        {showOpenTab && (
          <a href={`/console/${job.id}`} target="_blank" rel="noreferrer"
            className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">↗ Tab riêng</a>
        )}
        {onClose && <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>}
      </header>

      <div ref={streamRef} onScroll={onScroll} className="relative flex-1 space-y-3 overflow-y-auto p-4">
        {blocks.length === 0 && <p className="text-center text-sm text-text-muted">Chưa có sự kiện nào.</p>}
        {blocks.map((b, i) =>
          b.type === 'text' ? (
            <div key={i} className="whitespace-pre-wrap text-[14px] leading-[1.65] text-text-primary">{b.text}</div>
          ) : b.type === 'tool' ? (
            <details key={i} className="rounded-lg border border-border bg-surface">
              <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-text-secondary">
                <span className={b.isError ? 'text-danger' : 'text-accent'}>⚙ {b.tool}</span>
                <span className="ml-2 text-text-muted">{b.inputPreview}</span>
              </summary>
              {b.output != null && (
                <pre className={`max-h-64 overflow-auto border-t border-border bg-sunken p-3 font-mono text-[11.5px] leading-[1.55] ${b.isError ? 'text-danger' : 'text-text-secondary'}`}>{b.output}</pre>
              )}
            </details>
          ) : (
            <div key={i} className={`font-mono text-[11px] ${b.tone === 'danger' ? 'text-danger' : b.tone === 'user' ? 'text-accent' : 'text-text-muted'}`}>{b.text}</div>
          ),
        )}
        {!pinned && (
          <button onClick={() => { setPinned(true); streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight }) }}
            className="sticky bottom-2 left-full rounded-full border border-border bg-raised px-3 py-1 text-xs text-text-secondary">↓ mới nhất</button>
        )}
      </div>

      <footer className="border-t border-border bg-surface p-3">
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send('queue') } }}
            placeholder={readOnly ? 'Phiên đã đóng (job bị hủy)' : continuing ? 'Tiếp tục phiên — nhắn cho AI…' : 'Nhắn cho AI (Enter gửi, AI nhận khi xong lượt)…'}
            disabled={readOnly || busy}
            className="flex-1 resize-none rounded-lg border border-border bg-sunken px-3 py-2 text-[14px] text-text-primary outline-none transition-colors duration-150 focus:border-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-1">
            <button disabled={readOnly || busy || !text.trim()} onClick={() => void send('queue')}
              className="rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep px-4 py-1.5 text-xs font-semibold text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
              {continuing ? 'Tiếp tục phiên' : 'Gửi'}
            </button>
            {job.state === 'running' && (
              <button disabled={busy || !text.trim()} onClick={() => void send('steer')}
                title="Dừng lượt hiện tại ngay và chỉ đạo lại"
                className="rounded-lg border border-danger-border bg-danger-bg px-4 py-1.5 text-xs font-semibold text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                ⚡ Ngắt & chỉ đạo
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 4: ConsolePage + routing.** Create `ui/src/components/ConsolePage.tsx`:

```tsx
import { useState } from 'react'
import { Login } from './Login.js'
import { ConsoleView } from './ConsoleView.js'
import { useBoard } from '../useBoard.js'

export function ConsolePage({ jobId }: { jobId: string }) {
  const [authed, setAuthed] = useState(true)
  const { snapshot, subscribe, refresh } = useBoard(() => setAuthed(false))

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-text-secondary">Đang tải…</div>
  const job = snapshot.jobs.find((j) => j.id === jobId)
  if (!job) return <div className="p-8 text-text-secondary">Không tìm thấy job {jobId}.</div>
  return <div className="h-screen"><ConsoleView job={job} subscribe={subscribe} /></div>
}
```

In `ui/src/main.tsx` route by pathname (before rendering App):

```tsx
const consoleMatch = location.pathname.match(/^\/console\/([A-Za-z0-9_-]+)$/)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {consoleMatch ? <ConsolePage jobId={consoleMatch[1]} /> : <App />}
  </StrictMode>,
)
```

- [ ] **Step 5: App overlay + integrations.**
  - `App.tsx`: replace `logLines` usage with `previews`/`subscribe` from useBoard; add `const [consoleJob, setConsoleJob] = useState<string | null>(null)`; pass `onOpenConsole={setConsoleJob}` + `previews` to ActivityPanel and `onOpenConsole` to TaskDrawer; render the overlay when set:

```tsx
      {consoleJob && snapshot.jobs.find((j) => j.id === consoleJob) && (
        <div className="fixed inset-3 z-30 overflow-hidden rounded-xl border border-border-strong shadow-2xl">
          <ConsoleView job={snapshot.jobs.find((j) => j.id === consoleJob)!} subscribe={subscribe}
            onClose={() => setConsoleJob(null)} showOpenTab />
        </div>
      )}
```

  - `ActivityPanel.tsx`: props become `{ jobs, previews, onOpenConsole }`; replace the running-job `<pre>` log tail with a 2-line preview `<p className="mt-2 line-clamp-2 font-mono text-[11px] text-text-muted">{previews[job.id] ?? 'Đang chờ output…'}</p>` and add a "Mở console" secondary button on EVERY job entry (`onClick={() => onOpenConsole(job.id)}`); keep cancel + RescanReview as-is.
  - `TaskDrawer.tsx`: new optional prop `onOpenConsole?: (jobId: string) => void`; when `item.job` exists render a secondary button "Mở console" calling it.
  - ESC closes the overlay: in App add a `useEffect` keydown listener when `consoleJob` set.

- [ ] **Step 6: DESIGN_SYSTEM.** Append a `**Console**` recipe bullet under Component recipes: header strip (surface, mono ids, state pill), stream area on base with reading-baseline text, tool cards = surface `<details>` with mono summary and sunken result well, system lines mono 11px muted (danger for errors, accent for user notes), input bar surface with sunken textarea, primary send + danger-tinted steer; auto-scroll pinned with "↓ mới nhất" jump pill.

- [ ] **Step 7:** Gates: grep-gate (no raw palette classes), `npm run typecheck && npx vite build ui && npx vitest run` all green. Commit: `feat(board-ui): live job console with overlay and dedicated tab`

---

### Task 5: e2e, version, deploy

- [ ] **Step 1: e2e in a throwaway clone** (same harness as previous e2es: clone the repo's worktree-equivalent → branch `main`, copy node_modules, `BOARD_UI_DIST` unset). Stub claude (`stub-claude`) now emits stream-json and supports `--resume`:

```bash
#!/bin/bash
set -e
SESSION="e2e-session-1"
echo '{"type":"system","subtype":"init","session_id":"'$SESSION'","model":"stub"}'
if [[ "$*" == *"--resume"* ]]; then
  echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"continuing per your message"}}}'
  echo "follow-up line" >> README.md
else
  echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"working on the task"}}}'
  echo "e2e stub change" >> README.md
fi
git add -A && git commit -m "feat: stub change" -q
echo '{"type":"result","subtype":"success","duration_ms":100,"total_cost_usd":0.01}'
```

Flow: login → create task → ready → dispatch → poll `/api/jobs/job-001/events` until a `text_delta` appears → POST message `{text:"add a follow-up", mode:"queue"}` (segment 1 still running? the stub exits fast — if the job already succeeded, this exercises continue-after-finish instead; BOTH outcomes are valid, assert accordingly) → wait for final succeeded + task review → events replay contains: init, text_delta(s), note(user_message), turn_result ×2 → diff contains both README lines → merge → done. Also: GET `/console/job-001` returns the SPA HTML (build the ui in the clone for this). Record outputs.

- [ ] **Step 2:** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.13.0`; commit `chore(jd): bump plugin to 0.13.0 (job console)`.
- [ ] **Step 3:** Merge `job-console` → `main`, push origin.
- [ ] **Step 4:** Restart the gamesync board (kill :4400, regenerate password, start per skill step 5), verify login + `/console/` deep link serves HTML. Report URL + password.

---

## Self-review notes

- Spec coverage: segments/queue/steer/continue (T2), session capture + persist (T2), normalizer + board notes + replay (T1/T3), WS job_event + job_log removal (T1/T4), routes incl. validation/409/404 + SAFE_ID (T3), SPA catch-all + deep link (T3/T4), ConsoleView overlay + tab + ESC + auto-scroll + read-only states (T4), ActivityPanel preview + Mở console + TaskDrawer button (T4), DESIGN_SYSTEM Console recipe (T4), timeout-spans-segments + queue-discard-on-failure + steer-degrades races (T2), restart/interrupted continue via persisted sessionId + cwd repopulation via GitOps.worktreePath (T2), e2e with stream-json stub + resume (T5).
- Type consistency: `GitOps` gains `hasWorktree` + `worktreePath` (both on BoardGit already / trivially); `useBoard` returns `previews`/`subscribe` (App/ActivityPanel updated in T4); `normalizeLine` returns arrays everywhere (runner `for..of`, routes `flatMap`).
- The T2 continue-after-finish path repopulates `cwds` via `GitOps.worktreePath` before `armTimer`/`startSegment` (see preservation notes) so interrupted jobs are continuable after a server restart.
