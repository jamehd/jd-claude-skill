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
    hasWorktree: vi.fn(() => true),
    worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
  }
  const runner = new JobRunner({
    store, hub: new WsHub(), git, spawnFn,
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
             branchDiff: () => '', mergeBranch: () => {}, createPr: () => '',
             hasWorktree: () => true, worktreePath: () => dataDir },
      spawnFn: () => { const p = new FakeProc(); procs.push(p); return p as never },
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

  it('rescan succeeds when status files changed', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['project-board/data/status/infra.md'])
    const job = t.runner.dispatchRescan()
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
      hasWorktree: vi.fn(() => true),
      worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
    }
    let runner!: JobRunner
    expect(() => {
      runner = new JobRunner({
        store, hub: new WsHub(), git, spawnFn: vi.fn() as never,
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
      hasWorktree: vi.fn(() => true),
      worktreePath: vi.fn(() => path.join(dataDir, 'wt')),
    }
    const runner = new JobRunner({
      store, hub: new WsHub(), git, spawnFn: vi.fn() as never,
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
             branchDiff: () => '', mergeBranch: () => {}, createPr: () => '',
             hasWorktree: () => true, worktreePath: () => dataDir },
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
