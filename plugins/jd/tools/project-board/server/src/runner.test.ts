import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'
import { JobRunner, type SpawnFn, type GitOps } from './jobs/runner.js'

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
    isPrMerged: vi.fn(() => true),
    hasWorktree: vi.fn(() => true),
    worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
    porcelain: vi.fn(() => [] as string[]),
  }
  const runner = new JobRunner({
    store, hub: new WsHub(), git, spawnFn, repoRoot: dataDir,
    jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 5000, maxConcurrent: 1,
  })
  const sendInit = (i = 0, session = 'sess-1') =>
    procs[i].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: session }) + '\n'))
  return { store, runner, git, spawnFn, spawnCalls, item, procs, sendInit, dataDir }
}

describe('JobRunner', () => {
  it('dispatch runs a job: worktree, ai_running, success when the branch has commits; server flips task to review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['some/file.ts'])
    const job = t.runner.dispatchTask(t.item.id)
    expect(job.state).toBe('running')
    expect(t.git.createWorktree).toHaveBeenCalledWith(t.item.id)
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')

    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    const item = t.store.getItem(t.item.id)!
    expect(item.status).toBe('review')
    expect(item.body).toContain('## AI result')
  })

  it('marks job failed and resets task when exit is 0 but no commits on the branch', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    const item = t.store.getItem(t.item.id)!
    expect(item.status).toBe('ready')
    expect(item.body).toContain('## AI result')
  })

  it('fails on nonzero exit', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.procs[0].emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
  })

  it('kills the process on timeout', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
    for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
    const store = new BoardStore(dataDir)
    const item = store.createItem({ type: 'task', title: 'T', component: 'infra' })
    store.updateItem(item.id, { status: 'ready' })
    const procs: FakeProc[] = []
    const runner = new JobRunner({
      store, hub: new WsHub(),
      git: { createWorktree: () => dataDir, removeWorktree: () => {}, changedFiles: () => [],
             branchDiff: () => '', mergeBranch: () => {}, createPr: () => '', isPrMerged: () => true,
             hasWorktree: () => true, worktreePath: () => dataDir, porcelain: () => [] },
      spawnFn: () => { const p = new FakeProc(); procs.push(p); return p as never },
      repoRoot: dataDir,
      jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
    })
    const job = runner.dispatchTask(item.id)
    await vi.waitFor(() => expect(runner.getJob(job.id)?.state).toBe('failed'), { timeout: 2000 })
    expect(procs[0].killed).toBe(true)
  })

  it('queues a second dispatch while one is running', () => {
    const t = setup()
    const second = t.store.createItem({ type: 'task', title: 'More', component: 'infra' })
    t.store.updateItem(second.id, { status: 'ready' })
    t.runner.dispatchTask(t.item.id)
    const job2 = t.runner.dispatchTask(second.id)
    expect(job2.state).toBe('queued')
  })

  it('writes a log file and job metadata', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.procs[0].stdout.emit('data', Buffer.from('working...\n'))
    t.procs[0].emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    const files = readdirSync(path.join(t.dataDir, 'jobs'))
    expect(files).toContain(`${job.id}.log`)
    expect(files).toContain(`${job.id}.json`)
    expect(readFileSync(path.join(t.dataDir, 'jobs', `${job.id}.log`), 'utf8')).toContain('working...')
  })

  const STATUS_MD = '---\ncomponent: infra\nbuilt: 50\ntested: 40\nlast_scanned: 2026-06-11\n---\nSummary.\n\n## Gaps\n- [ ] thing\n'

  it('rescan runs in repoRoot (no worktree) and succeeds when a status file is written to disk', async () => {
    const t = setup()
    const job = t.runner.dispatchRescan()
    // No worktree must be created for a rescan.
    expect(t.git.createWorktree).not.toHaveBeenCalledWith('RESCAN')
    expect(t.git.createWorktree).not.toHaveBeenCalled()
    // Rescan spawns in the repo root, not a worktree path.
    expect((t.spawnFn as ReturnType<typeof vi.fn>).mock.calls[0][2]).toEqual({ cwd: t.dataDir })
    // Simulate the AI writing a status file AFTER dispatch so its mtime beats the snapshot.
    writeFileSync(path.join(t.dataDir, 'status', 'infra.md'), STATUS_MD)
    t.procs[0].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }) + '\n'))
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
  })

  it('rescan fails with the no-change reason when exit 0 but no status file changed', async () => {
    const t = setup()
    const job = t.runner.dispatchRescan()
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    expect(t.runner.getJob(job.id)?.error).toMatch(/no files under project-board\/data\/status changed/)
  })

  it('rescan fails with stray-change reason when porcelain gains a new entry', async () => {
    const t = setup()
    // Start snapshot is clean; after the process exits the mock returns a new stray line.
    ;(t.git.porcelain as ReturnType<typeof vi.fn>).mockReturnValue([])
    const job = t.runner.dispatchRescan()
    // Status file written so completedSuccessfully() returns true, reaching the stray guard.
    writeFileSync(path.join(t.dataDir, 'status', 'infra.md'), STATUS_MD)
    // Now simulate porcelain showing a tracked-file change introduced during rescan.
    ;(t.git.porcelain as ReturnType<typeof vi.fn>).mockReturnValue([' M src/foo.ts'])
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    expect(t.runner.getJob(job.id)?.error).toMatch(/rescan touched files outside project-board\/data\/status/)
    expect(t.runner.getJob(job.id)?.error).toContain('src/foo.ts')
  })

  it('rescan with stray present at start is not a false positive', async () => {
    const t = setup()
    // The repo already had an uncommitted change before dispatch — not introduced by the rescan.
    ;(t.git.porcelain as ReturnType<typeof vi.fn>).mockReturnValue([' M pre-existing.ts'])
    const job = t.runner.dispatchRescan()
    writeFileSync(path.join(t.dataDir, 'status', 'infra.md'), STATUS_MD)
    // After the run, porcelain returns the same pre-existing entry only — rescan added nothing.
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
  })

  it('cancel kills and resets the task', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.runner.cancel(job.id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('cancelled'))
    expect(t.store.getItem(t.item.id)?.status).toBe('ready')
  })

  it('shutdown marks running jobs interrupted and kills processes', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.runner.shutdown()
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('interrupted'))
    expect(t.procs[0].killed).toBe(true)
    expect(t.store.getItem(t.item.id)?.status).toBe('ready')
  })

  it('dispatchTask throws when the task already has an active job', () => {
    const t = setup()
    t.runner.dispatchTask(t.item.id)
    expect(() => t.runner.dispatchTask(t.item.id)).toThrow(`task ${t.item.id} already has an active job`)
  })

  it('dispatchRescan throws when a rescan job is already active', () => {
    const t = setup()
    t.runner.dispatchRescan()
    expect(() => t.runner.dispatchRescan()).toThrow('rescan already running')
  })

  it('survives a corrupt job file at construction and excludes it from listJobs', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
    for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
    const store = new BoardStore(dataDir)
    const jobsDir = path.join(dataDir, 'jobs')
    writeFileSync(path.join(jobsDir, 'job-001.json'), '{"id":"job-0')
    const git: GitOps = {
      createWorktree: vi.fn(() => path.join(dataDir, 'wt')),
      removeWorktree: vi.fn(),
      changedFiles: vi.fn(() => []),
      branchDiff: vi.fn(() => ''),
      mergeBranch: vi.fn(),
      createPr: vi.fn(() => ''),
      isPrMerged: vi.fn(() => true),
      hasWorktree: vi.fn(() => true),
      worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
      porcelain: vi.fn(() => [] as string[]),
    }
    let runner!: JobRunner
    expect(() => {
      runner = new JobRunner({
        store, hub: new WsHub(), git, spawnFn: vi.fn() as never, repoRoot: dataDir,
        jobsDir, claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
      })
    }).not.toThrow()
    expect(runner.listJobs().some((j) => j.id === 'job-001')).toBe(false)
  })

  it('recovers an interrupted running job and resets its task to ready', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
    for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
    const store = new BoardStore(dataDir)
    const item = store.createItem({ type: 'task', title: 'Recovered', component: 'infra' })
    store.updateItem(item.id, { status: 'ai_running' })
    const jobsDir = path.join(dataDir, 'jobs')
    writeFileSync(
      path.join(jobsDir, 'job-002.json'),
      JSON.stringify({ id: 'job-002', kind: 'task', taskId: item.id, state: 'running' }),
    )
    const git: GitOps = {
      createWorktree: vi.fn(() => path.join(dataDir, 'wt')),
      removeWorktree: vi.fn(),
      changedFiles: vi.fn(() => []),
      branchDiff: vi.fn(() => ''),
      mergeBranch: vi.fn(),
      createPr: vi.fn(() => ''),
      isPrMerged: vi.fn(() => true),
      hasWorktree: vi.fn(() => true),
      worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
      porcelain: vi.fn(() => [] as string[]),
    }
    const runner = new JobRunner({
      store, hub: new WsHub(), git, spawnFn: vi.fn() as never, repoRoot: dataDir,
      jobsDir, claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
    })
    expect(runner.getJob('job-002')?.state).toBe('interrupted')
    expect(store.getItem(item.id)?.status).toBe('ready')
  })

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

  it('steer arriving after natural exit degrades to continue-after-finish', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const job = t.runner.dispatchTask(t.item.id)
    t.sendInit()
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    t.runner.message(job.id, 'late steer', 'steer')
    expect(t.runner.getJob(job.id)?.state).toBe('running')
    await vi.waitFor(() => expect(t.spawnCalls).toHaveLength(2))
    expect(t.spawnCalls[1]).toEqual(expect.arrayContaining(['-p', 'late steer', '--resume', 'sess-1']))
    expect(t.procs[0].killed).toBe(false)
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
             branchDiff: () => '', mergeBranch: () => {}, createPr: () => '', isPrMerged: () => true,
             hasWorktree: () => true, worktreePath: () => dataDir, porcelain: () => [] },
      spawnFn: () => { const p = new FakeProc(); procs.push(p); return p as never },
      repoRoot: dataDir,
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

  it('reconcileOrphanedTasks resets an ai_running task with no live job', () => {
    const t = setup()
    // No job dispatched; force the orphaned state directly.
    t.store.updateItem(t.item.id, { status: 'ai_running' })
    const resets = t.runner.reconcileOrphanedTasks()
    expect(resets).toBe(1)
    expect(t.store.getItem(t.item.id)?.status).toBe('ready')
    expect(t.store.getItem(t.item.id)?.body).toContain('orphaned')
  })

  it('reconcileOrphanedTasks does NOT reset a task with a live running job', () => {
    const t = setup()
    t.runner.dispatchTask(t.item.id)  // -> ai_running with a live running job
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')
    const resets = t.runner.reconcileOrphanedTasks()
    expect(resets).toBe(0)
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')
  })

  // Creates a ready task and returns its id. Used by the auto-dispatch suite.
  function ready(t: ReturnType<typeof setup>, title: string, priority: string = 'P2'): string {
    const item = t.store.createItem({ type: 'task', title, component: 'infra' })
    t.store.updateItem(item.id, { status: 'ready', priority: priority as never })
    return item.id
  }

  // Drives the job at process index `i` to a successful terminal commit (exit 0 + changed files).
  async function complete(t: ReturnType<typeof setup>, i: number): Promise<void> {
    await vi.waitFor(() => expect(t.procs[i]).toBeDefined())
    t.procs[i].stdout.emit('data', Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', session_id: `sess-${i}` }) + '\n'))
    t.procs[i].emit('exit', 0)
  }

  describe('auto-dispatch', () => {
    // Park the harness default ready task so only explicitly created tasks are candidates.
    function fresh() {
      const t = setup()
      t.store.updateItem(t.item.id, { status: 'backlog' })
      return t
    }

    it('is off by default', () => {
      const t = fresh()
      expect(t.runner.getAuto().enabled).toBe(false)
    })

    it('enabling dispatches the highest-priority ready task', () => {
      const t = fresh()
      ready(t, 'low', 'P3')
      const hi = ready(t, 'high', 'P0')
      t.runner.setAuto({ enabled: true })
      expect(t.store.getItem(hi)?.status).toBe('ai_running')
      expect(t.runner.getAuto().dispatched).toBe(1)
    })

    it('picks the next ready task on job completion', async () => {
      const t = fresh()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      const first = ready(t, 'first', 'P1')
      const second = ready(t, 'second', 'P2')
      t.runner.setAuto({ enabled: true })
      expect(t.store.getItem(first)?.status).toBe('ai_running')
      await complete(t, 0)
      await vi.waitFor(() => expect(t.store.getItem(first)?.status).toBe('review'))
      await vi.waitFor(() => expect(t.store.getItem(second)?.status).toBe('ai_running'))
    })

    it('never auto-dispatches a backlog task', () => {
      const t = fresh()
      const item = t.store.createItem({ type: 'task', title: 'backlog one', component: 'infra' })
      t.store.updateItem(item.id, { status: 'backlog', priority: 'P0' })
      t.runner.setAuto({ enabled: true })
      expect(t.store.getItem(item.id)?.status).toBe('backlog')
      expect(t.runner.getAuto().dispatched).toBe(0)
    })

    it('stops at maxAuto', async () => {
      const t = fresh()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      ready(t, 'one', 'P1')
      ready(t, 'two', 'P1')
      ready(t, 'three', 'P1')
      t.runner.setAuto({ enabled: true, maxAuto: 2 })
      await complete(t, 0)
      await vi.waitFor(() => expect(t.procs).toHaveLength(2))
      await complete(t, 1)
      // Give any erroneous third dispatch a chance to spawn before asserting it did not.
      await vi.waitFor(() => expect(t.runner.getAuto().dispatched).toBe(2))
      expect(t.spawnCalls).toHaveLength(2)
    })

    it('pauses after 3 consecutive auto-failures', async () => {
      const t = fresh()
      // Default changedFiles returns [] -> exit 0 with no commit -> FAILED.
      ready(t, 'one', 'P1')
      ready(t, 'two', 'P1')
      ready(t, 'three', 'P1')
      t.runner.setAuto({ enabled: true, maxAuto: 99 })
      await complete(t, 0)
      await vi.waitFor(() => expect(t.procs).toHaveLength(2))
      await complete(t, 1)
      await vi.waitFor(() => expect(t.procs).toHaveLength(3))
      await complete(t, 2)
      await vi.waitFor(() => expect(t.runner.getAuto().paused).toBe(true))
      expect(t.runner.getAuto().pauseReason).toMatch(/fail/i)
    })

    it('resets consecutiveFailures after a success', async () => {
      const t = fresh()
      const changed = t.git.changedFiles as ReturnType<typeof vi.fn>
      changed.mockReturnValue([]) // first job fails (no commit)
      ready(t, 'one', 'P1')
      ready(t, 'two', 'P1')
      t.runner.setAuto({ enabled: true, maxAuto: 99 })
      await complete(t, 0)
      await vi.waitFor(() => expect(t.runner.getAuto().consecutiveFailures).toBe(1))
      changed.mockReturnValue(['a.ts']) // second job succeeds
      await vi.waitFor(() => expect(t.procs).toHaveLength(2))
      await complete(t, 1)
      await vi.waitFor(() => expect(t.runner.getAuto().consecutiveFailures).toBe(0))
    })

    it('disabling stops further dispatch', async () => {
      const t = fresh()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      ready(t, 'one', 'P1')
      ready(t, 'two', 'P1')
      const first = t.runner.setAuto({ enabled: true })
      expect(first.dispatched).toBe(1)
      expect(t.spawnCalls).toHaveLength(1)
      t.runner.setAuto({ enabled: false })
      // Complete the in-flight job; with auto disabled no second task may be dispatched.
      const jobId = t.runner.listJobs()[0].id
      await complete(t, 0)
      await vi.waitFor(() => expect(t.runner.getJob(jobId)?.state).toBe('succeeded'))
      expect(t.runner.getAuto().enabled).toBe(false)
      expect(t.spawnCalls).toHaveLength(1)
    })

    it('a failed auto task is not re-picked; auto advances to the next ready task', async () => {
      const t = fresh()
      // Default changedFiles returns [] -> exit 0 with no commit -> the first job FAILS.
      // A is created first so it sorts ahead of B (same created date, lower id).
      const a = ready(t, 'A', 'P1')
      const b = ready(t, 'B', 'P1')
      t.runner.setAuto({ enabled: true, maxAuto: 99 })
      expect(t.store.getItem(a)?.status).toBe('ai_running')
      await complete(t, 0) // A fails -> back to ready, but excluded from re-selection
      await vi.waitFor(() => expect(t.store.getItem(b)?.status).toBe('ai_running'))
      expect(t.store.getItem(a)?.status).toBe('ready')
    })

    it('re-enabling clears the failed set so a previously-failed task can run again', async () => {
      const t = fresh()
      const a = ready(t, 'A', 'P1')
      const b = ready(t, 'B', 'P1')
      t.runner.setAuto({ enabled: true, maxAuto: 99 })
      await complete(t, 0) // A fails and is excluded
      await vi.waitFor(() => expect(t.store.getItem(b)?.status).toBe('ai_running'))
      // Finish B's job to free the single concurrency slot (it fails back to ready),
      // then take B out of contention so A is the only eligible task once the set clears.
      const bJob = t.runner.listJobs().find((j) => j.taskId === b)!.id
      await complete(t, 1)
      await vi.waitFor(() => expect(t.runner.getJob(bJob)?.state).toBe('failed'))
      t.store.updateItem(b, { status: 'backlog' })
      t.runner.setAuto({ enabled: false })
      t.runner.setAuto({ enabled: true, maxAuto: 99 })
      await vi.waitFor(() => expect(t.store.getItem(a)?.status).toBe('ai_running'))
    })
  })

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
})
