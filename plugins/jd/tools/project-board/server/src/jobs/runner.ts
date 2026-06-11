import { appendFileSync, writeFileSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { BoardStore } from '../store.js'
import type { WsHub } from '../ws.js'
import type { Job, JobKind } from '../../../ui/src/types.js'
import { buildTaskPrompt, buildRescanPrompt } from './prompt.js'

export type SpawnFn = (bin: string, args: string[], opts: { cwd: string }) => ChildProcess

export interface GitOps {
  createWorktree(taskId: string): string
  removeWorktree(taskId: string): void
  changedFiles(taskId: string): string[]
  branchDiff(taskId: string): string
  mergeBranch(taskId: string, message: string): void
  createPr(taskId: string, title: string, body: string): string
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

export class JobRunner {
  private jobs = new Map<string, Job>()
  private queue: Job[] = []
  private running = new Map<string, { proc: ChildProcess; timer: NodeJS.Timeout }>()
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

  private hasActiveJob(match: (job: Job) => boolean): boolean {
    for (const job of this.jobs.values()) {
      if ((job.state === 'queued' || job.state === 'running') && match(job)) return true
    }
    return false
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.state === 'queued') {
      this.queue = this.queue.filter((j) => j.id !== jobId)
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

  private enqueue(kind: JobKind, taskId?: string): Job {
    const job: Job = { id: this.nextJobId(), kind, taskId, state: 'queued' }
    this.jobs.set(job.id, job)
    this.persist(job)
    this.queue.push(job)
    this.pump()
    return job
  }

  private pump(): void {
    if (!this.deps) return
    while (this.running.size < this.deps.maxConcurrent && this.queue.length > 0) {
      this.start(this.queue.shift()!)
    }
  }

  private start(job: Job): void {
    const { store, git, hub, jobsDir, claudeBin, timeoutMs } = this.deps!
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

    const proc = this.spawnFn(claudeBin, ['-p', prompt, '--dangerously-skip-permissions'], { cwd })
    const logFile = path.join(jobsDir, `${job.id}.log`)
    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      appendFileSync(logFile, line)
      hub.broadcast({ type: 'job_log', jobId: job.id, line })
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)

    const timer = setTimeout(() => {
      job.error = `timeout after ${timeoutMs}ms`
      proc.kill('SIGTERM')
    }, timeoutMs)

    this.running.set(job.id, { proc, timer })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      this.running.delete(job.id)
      if (job.state === 'cancelled' || job.state === 'interrupted') {
        this.afterFailure(job, job.state === 'cancelled' ? 'cancelled by user' : 'server shutdown')
        this.finishKeepState(job)
      } else if (job.error) {
        this.afterFailure(job, job.error)
        this.finish(job, 'failed', job.error)
      } else if (code !== 0) {
        this.afterFailure(job, `claude exited with code ${code}`)
        this.finish(job, 'failed', `exit code ${code}`)
      } else if (this.completedSuccessfully(job)) {
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
    })
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
      store.appendToBody(
        job.taskId!,
        `## AI result\nJob ${job.id} succeeded on branch board/${job.taskId}.\nChanged files:\n${git.changedFiles(job.taskId!).map((f) => `- ${f}`).join('\n')}\nFull output: data/jobs/${job.id}.log`,
      )
    } catch {
      job.error = 'job succeeded but the task file could not be updated to review'
    }
  }

  private afterFailure(job: Job, reason: string): void {
    const { store } = this.deps!
    if (job.kind !== 'task') return
    try {
      store.updateItem(job.taskId!, { status: 'ready' })
      store.appendToBody(job.taskId!, `## AI result\nJob ${job.id} failed: ${reason}\nWorktree/branch kept for inspection: board/${job.taskId}`)
    } catch { /* task file may be unparseable after a bad AI edit; job error is still recorded */ }
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
    const target = path.join(this.deps.jobsDir, `${job.id}.json`)
    const tmp = `${target}.tmp`
    writeFileSync(tmp, JSON.stringify(job, null, 2))
    renameSync(tmp, target)
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
      const full = path.join(jobsDir, f)
      let job: Job
      try {
        job = JSON.parse(readFileSync(full, 'utf8')) as Job
      } catch {
        try { renameSync(full, `${full}.corrupt`) } catch { /* best effort; skip regardless */ }
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
