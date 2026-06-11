import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

  let proc: FakeProc
  const spawnFn: SpawnFn = vi.fn(() => { proc = new FakeProc(); return proc as never })
  const git: GitOps = {
    createWorktree: vi.fn(() => path.join(dataDir, 'wt')),
    removeWorktree: vi.fn(),
    changedFiles: vi.fn(() => []),
    branchDiff: vi.fn(() => ''),
    mergeBranch: vi.fn(),
    createPr: vi.fn(() => ''),
  }
  const runner = new JobRunner({
    store, hub: new WsHub(), git, spawnFn,
    jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
  })
  return { store, runner, git, spawnFn, item, proc: () => proc!, dataDir }
}

describe('JobRunner', () => {
  it('dispatch runs a job: worktree, ai_running, success when the branch has commits; server flips task to review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['some/file.ts'])
    const job = t.runner.dispatchTask(t.item.id)
    expect(job.state).toBe('running')
    expect(t.git.createWorktree).toHaveBeenCalledWith(t.item.id)
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')

    t.proc().emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
    const item = t.store.getItem(t.item.id)!
    expect(item.status).toBe('review')
    expect(item.body).toContain('## AI result')
  })

  it('marks job failed and resets task when exit is 0 but no commits on the branch', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.proc().emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    const item = t.store.getItem(t.item.id)!
    expect(item.status).toBe('ready')
    expect(item.body).toContain('## AI result')
  })

  it('fails on nonzero exit', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.proc().emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
  })

  it('kills the process on timeout', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'), { timeout: 2000 })
    expect(t.proc().killed).toBe(true)
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
    t.proc().stdout.emit('data', Buffer.from('working...\n'))
    t.proc().emit('exit', 1)
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
    t.proc().emit('exit', 0)
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
    expect(t.proc().killed).toBe(true)
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
    }
    const runner = new JobRunner({
      store, hub: new WsHub(), git, spawnFn: vi.fn() as never,
      jobsDir, claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
    })
    expect(runner.getJob('job-002')?.state).toBe('interrupted')
    expect(store.getItem(item.id)?.status).toBe('ready')
  })
})
