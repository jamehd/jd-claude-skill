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
    commitMessages: vi.fn(() => [] as string[]),
    branchDiff: vi.fn(() => ''),
    mergeBranch: vi.fn(),
    createPr: vi.fn(() => ''),
    deleteRemoteBranch: vi.fn(),
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
  // Feeds an arbitrary JSON line into a job's stdout the same way sendInit feeds the init line.
  const feedLine = (i: number, obj: unknown) =>
    procs[i].stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n'))
  return { store, runner, git, spawnFn, spawnCalls, item, procs, sendInit, feedLine, dataDir }
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

  it('appends Requirements touched with the req ids from a Req: trailer in a commit message', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['some/file.ts'])
    ;(t.git.commitMessages as ReturnType<typeof vi.fn>).mockReturnValue(['feat: x\n\nReq: CAFE-R3'])
    const job = t.runner.dispatchTask(t.item.id)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    expect(t.store.getItem(t.item.id)!.body).toContain('Requirements touched: CAFE-R3')
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
             commitMessages: () => [], branchDiff: () => '', mergeBranch: () => {}, createPr: () => '', deleteRemoteBranch: () => {},
             isPrMerged: () => true, hasWorktree: () => true, worktreePath: () => dataDir, porcelain: () => [] },
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
      commitMessages: vi.fn(() => [] as string[]),
      branchDiff: vi.fn(() => ''),
      mergeBranch: vi.fn(),
      createPr: vi.fn(() => ''),
      deleteRemoteBranch: vi.fn(),
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
      commitMessages: vi.fn(() => [] as string[]),
      branchDiff: vi.fn(() => ''),
      mergeBranch: vi.fn(),
      createPr: vi.fn(() => ''),
      deleteRemoteBranch: vi.fn(),
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
             commitMessages: () => [], branchDiff: () => '', mergeBranch: () => {}, createPr: () => '', deleteRemoteBranch: () => {},
             isPrMerged: () => true, hasWorktree: () => true, worktreePath: () => dataDir, porcelain: () => [] },
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

  it('a failed manually-dispatched un-shaped task lands in backlog, not ready', async () => {
    const t = setup()
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra', requiresShaping: true }).id
    // Manual dispatch is intentionally ungated; the job then fails (exit 0, no commits).
    const job = t.runner.dispatchTask(id)
    t.procs.at(-1)!.emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    // Bouncing it to ready would let auto-dispatch run an unshaped task headless.
    expect(t.store.getItem(id)?.status).toBe('backlog')
  })

  it('reconcileOrphanedTasks sends an orphaned un-shaped task to backlog', () => {
    const t = setup()
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra', requiresShaping: true }).id
    t.store.updateItem(id, { status: 'ai_running' }) // orphaned: no live job
    t.runner.reconcileOrphanedTasks()
    expect(t.store.getItem(id)?.status).toBe('backlog')
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

    it('never auto-picks a gated no-plan task even if it is sitting in ready', () => {
      const t = fresh()
      // Defense in depth: a gated task should never be auto-dispatched even if some
      // other path wrongly parked it in ready.
      const gated = t.store.createItem({ type: 'task', title: 'gated', component: 'infra', requiresShaping: true }).id
      t.store.updateItem(gated, { status: 'ready', priority: 'P0' })
      const trivial = ready(t, 'trivial', 'P2')
      t.runner.setAuto({ enabled: true })
      expect(t.store.getItem(gated)?.status).toBe('ready') // untouched, not picked
      expect(t.store.getItem(trivial)?.status).toBe('ai_running') // sibling IS picked
      expect(t.runner.getAuto().dispatched).toBe(1)
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

  describe('settings (maxConcurrent + failureThreshold)', () => {
    // Mirror setup()'s runner construction so a "fresh boot" sees the same store/deps/dataDir.
    function freshRunner(t: ReturnType<typeof setup>): JobRunner {
      return new JobRunner({
        store: t.store, hub: new WsHub(), git: t.git, spawnFn: t.spawnFn, repoRoot: t.dataDir,
        jobsDir: path.join(t.dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 5000, maxConcurrent: 1,
      })
    }

    it('getAuto reports maxConcurrent (number) and failureThreshold default of 3', () => {
      const t = setup()
      const auto = t.runner.getAuto()
      expect(typeof auto.maxConcurrent).toBe('number')
      expect(auto.maxConcurrent).toBe(1)
      expect(auto.failureThreshold).toBe(3)
    })

    it('raising maxConcurrent starts a queued job via re-pump', () => {
      const t = setup()
      const a = ready(t, 'A', 'P1')
      const b = ready(t, 'B', 'P1')
      t.runner.dispatchTask(a)
      const jobB = t.runner.dispatchTask(b)
      expect(jobB.state).toBe('queued')
      expect(t.spawnCalls).toHaveLength(1)

      t.runner.setAuto({ maxConcurrent: 2 })
      expect(t.runner.getAuto().maxConcurrent).toBe(2)
      // The re-pump should have started the queued job B.
      expect(t.spawnCalls).toHaveLength(2)
    })

    it('lowering maxConcurrent does not kill running jobs and caps new dispatch', () => {
      const t = setup()
      t.runner.setAuto({ maxConcurrent: 2 })
      const a = ready(t, 'A', 'P1')
      const b = ready(t, 'B', 'P1')
      t.runner.dispatchTask(a)
      t.runner.dispatchTask(b)
      expect(t.spawnCalls).toHaveLength(2)

      t.runner.setAuto({ maxConcurrent: 1 })
      const c = ready(t, 'C', 'P1')
      const jobC = t.runner.dispatchTask(c)
      // Two jobs already running stay running; c is queued, not started.
      expect(jobC.state).toBe('queued')
      expect(t.spawnCalls).toHaveLength(2)
    })

    it('persists maxConcurrent + failureThreshold; a fresh runner restores them', () => {
      const t = setup()
      t.runner.setAuto({ maxConcurrent: 4, failureThreshold: 5 })
      const raw = JSON.parse(readFileSync(path.join(t.dataDir, 'auto.json'), 'utf8'))
      expect(raw.maxConcurrent).toBe(4)
      expect(raw.failureThreshold).toBe(5)

      const restored = freshRunner(t)
      expect(restored.getAuto().maxConcurrent).toBe(4)
      expect(restored.getAuto().failureThreshold).toBe(5)
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

  describe('usage capture + aggregation', () => {
    it('captures per-job usage + cost from a result line', async () => {
      const t = setup()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      const job = t.runner.dispatchTask(t.item.id)
      t.sendInit(0)
      t.feedLine(0, {
        type: 'result', total_cost_usd: 0.5,
        usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      t.procs[0].emit('exit', 0)
      await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
      expect(t.runner.getJob(job.id)?.usage?.inputTokens).toBe(200)
      expect(t.runner.getJob(job.id)?.costUsd).toBe(0.5)
    })

    it('captures + persists the latest rate-limit snapshot', async () => {
      const t = setup()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      t.runner.dispatchTask(t.item.id)
      t.sendInit(0)
      t.feedLine(0, {
        type: 'rate_limit_event',
        rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600, isUsingOverage: false },
      })
      await vi.waitFor(() =>
        expect(t.runner.getUsage().rateLimit).toMatchObject({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1781265600 }),
      )
      expect(JSON.parse(readFileSync(`${t.dataDir}/usage.json`, 'utf8')).resetsAt).toBe(1781265600)
    })

    it('aggregates total tokens across jobs', async () => {
      const t = setup()
      ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
      const job = t.runner.dispatchTask(t.item.id)
      t.sendInit(0)
      t.feedLine(0, {
        type: 'result', total_cost_usd: 1,
        usage: { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      })
      t.procs[0].emit('exit', 0)
      await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
      expect(t.runner.getUsage().windows.total).toMatchObject({ inputTokens: 100, outputTokens: 100, costUsd: 1, jobs: 1 })
      // a job that just ended is "today" in any timezone (local-date bucketing)
      expect(t.runner.getUsage().windows.today.jobs).toBe(1)
    })

    it('reports empty usage with no data', () => {
      const t = setup()
      expect(t.runner.getUsage().rateLimit).toBe(null)
      expect(t.runner.getUsage().windows.total.jobs).toBe(0)
    })
  })
})

describe('AI resolve conflict', () => {
  function reviewTask(t: ReturnType<typeof setup>) {
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra' }).id
    t.store.updateItem(id, { status: 'review' })
    return id
  }

  it('dispatchResolve runs in the existing worktree (does not recreate it)', () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const createSpy = t.git.createWorktree as ReturnType<typeof vi.fn>
    const id = reviewTask(t)
    const job = t.runner.dispatchResolve(id)
    expect(job.kind).toBe('resolve')
    expect(createSpy).not.toHaveBeenCalled()
    expect(t.store.getItem(id)?.status).toBe('ai_running')
  })

  it('a successful resolve (changedFiles>0) returns the task to review', async () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const id = reviewTask(t)
    t.runner.dispatchResolve(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })

  it('resolve with no worktree fails clearly', async () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const id = reviewTask(t)
    const job = t.runner.dispatchResolve(id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    expect(t.runner.getJob(job.id)?.error).toMatch(/worktree/i)
  })

  it('a FAILED resolve returns the task to review (never stuck in ai_running)', async () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue([])  // exit 0 + no commits = failed
    const id = reviewTask(t)
    t.runner.dispatchResolve(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })
})

describe('board test gate', () => {
  function readyTask(t: ReturnType<typeof setup>) {
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra' }).id
    t.store.updateItem(id, { status: 'ready' })
    return id
  }
  function setCmd(t: ReturnType<typeof setup>, map: Record<string, string>) {
    writeFileSync(`${t.dataDir}/test-commands.json`, JSON.stringify(map))
  }
  // spawnCalls records ONLY args (not bin); the bin lands in spawnFn.mock.calls[i][0].
  function gateSpawnBin(t: ReturnType<typeof setup>, i: number) {
    return (t.spawnFn as ReturnType<typeof vi.fn>).mock.calls[i][0]
  }

  it('pass gate → review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    setCmd(t, { infra: 'echo ok' })
    const id = readyTask(t); t.runner.dispatchTask(id)
    t.sendInit(0); t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2))
    expect(gateSpawnBin(t, 1)).toBe('bash')
    expect(t.spawnCalls[1]).toEqual(expect.arrayContaining(['-lc', 'echo ok']))
    expect(t.store.getItem(id)?.status).toBe('ai_running')   // gate running, not review yet
    t.procs[1].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })

  it('fail gate → not review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    setCmd(t, { infra: 'exit 1' })
    const id = readyTask(t); t.runner.dispatchTask(id)
    t.sendInit(0); t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2))
    expect(gateSpawnBin(t, 1)).toBe('bash')
    expect(t.spawnCalls[1]).toEqual(expect.arrayContaining(['-lc', 'exit 1']))
    t.procs[1].emit('exit', 1)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).not.toBe('review'))
    expect(t.store.getItem(id)?.status).not.toBe('ai_running')
  })

  it('no config → straight to review (single spawn)', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const id = readyTask(t); t.runner.dispatchTask(id)
    t.sendInit(0); t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
    expect(t.spawnCalls.length).toBe(1)
  })

  it('rejects steering while the gate runs; the gate proc survives and completes', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    setCmd(t, { infra: 'echo ok' })
    const id = readyTask(t); const job = t.runner.dispatchTask(id)
    t.sendInit(0); t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2))   // gate running
    expect(() => t.runner.message(job.id, 'hey', 'steer')).toThrow(/test gate/i)
    t.procs[1].emit('exit', 0)                                    // gate not killed → finishes normally
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })
})
