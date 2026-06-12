import { appendFileSync, writeFileSync, readdirSync, readFileSync, renameSync, unlinkSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { BoardStore } from '../store.js'
import type { WsHub } from '../ws.js'
import type { ConsoleEvent, Job, JobKind, NoteType } from '../../../ui/src/types.js'
import { buildTaskPrompt, buildRescanPrompt } from './prompt.js'
import { parseRequirementsDir } from './requirements.js'
import { normalizeLine } from './events.js'

export type SpawnFn = (bin: string, args: string[], opts: { cwd: string }) => ChildProcess

export interface GitOps {
  createWorktree(taskId: string): string
  removeWorktree(taskId: string): void
  changedFiles(taskId: string): string[]
  branchDiff(taskId: string): string
  mergeBranch(taskId: string, message: string): void
  createPr(taskId: string, title: string, body: string): string
  isPrMerged(taskId: string): boolean
  hasWorktree(taskId: string): boolean
  worktreePath(taskId: string): string
  porcelain(): string[]
}

export interface RunnerDeps {
  store: BoardStore
  hub: WsHub
  git: GitOps
  repoRoot: string
  jobsDir: string
  claudeBin: string
  timeoutMs: number
  maxConcurrent: number
  spawnFn?: SpawnFn
}

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
  private statusSnapshots = new Map<string, Map<string, number>>()
  private porcelainSnapshots = new Map<string, Set<string>>()
  private spawnFn: SpawnFn

  constructor(private deps?: RunnerDeps) {
    this.spawnFn = deps?.spawnFn ?? spawn
    if (deps) {
      this.recoverInterrupted()
      this.reconcileOrphanedTasks()
    }
  }

  // Resets any task stuck in ai_running with no live (queued/running) job back to ready.
  // Returns the number of tasks reset. Safe to call repeatedly.
  reconcileOrphanedTasks(): number {
    if (!this.deps) return 0
    const hasLiveJob = (taskId: string) =>
      [...this.jobs.values()].some(
        (j) => (j.state === 'running' || j.state === 'queued') && j.taskId === taskId,
      )
    let resets = 0
    for (const item of this.deps.store.scan().items) {
      if (item.status !== 'ai_running') continue
      if (hasLiveJob(item.id)) continue
      this.deps.store.updateItem(item.id, { status: 'ready' })
      this.deps.store.appendToBody(item.id, 'Reset to ready: was ai_running with no live job (orphaned).')
      resets++
    }
    return resets
  }

  listJobs(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.id.localeCompare(a.id))
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id)
  }

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
    // Cheap insurance: heal any task stranded in ai_running without a live job.
    this.reconcileOrphanedTasks()
    return cleared
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
    if (job.kind === 'task' && !this.deps!.git.hasWorktree(job.taskId!)) {
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
    } else {
      // Re-snapshot so a follow-up rescan segment is judged against the current disk state.
      this.statusSnapshots.set(job.id, this.snapshotStatusDir())
      this.porcelainSnapshots.set(job.id, new Set(this.deps!.git.porcelain()))
    }
    if (!this.cwds.has(job.id)) {
      this.cwds.set(job.id, job.kind === 'task' ? this.deps!.git.worktreePath(job.taskId!) : this.deps!.repoRoot)
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
    job.startedAt = new Date().toISOString()
    job.state = 'running'

    let cwd: string
    let prompt: string
    if (job.kind === 'task') {
      job.branch = `board/${job.taskId!}`
      try {
        cwd = git.createWorktree(job.taskId!)
      } catch (err) {
        this.finish(job, 'failed', `worktree: ${err instanceof Error ? err.message : err}`)
        return
      }
      const item = store.getItem(job.taskId!)
      if (!item) {
        git.removeWorktree(job.taskId!)
        this.finish(job, 'failed', `task not found: ${job.taskId}`)
        return
      }
      store.updateItem(item.id, { status: 'ai_running', job: job.id })
      prompt = buildTaskPrompt(item, parseRequirementsDir(this.deps!.repoRoot))
    } else {
      // Rescan writes status files directly to disk in the live repo; no worktree.
      cwd = this.deps!.repoRoot
      this.statusSnapshots.set(job.id, this.snapshotStatusDir())
      this.porcelainSnapshots.set(job.id, new Set(this.deps!.git.porcelain()))
      prompt = buildRescanPrompt()
    }
    this.cwds.set(job.id, cwd)
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
      if (job.kind === 'task') {
        this.afterSuccess(job)
        this.finish(job, 'succeeded')
      } else {
        const strayReason = this.checkRescanStray(job)
        if (strayReason) {
          this.finish(job, 'failed', strayReason)
        } else {
          this.finish(job, 'succeeded')
        }
      }
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
    if (job.kind === 'task') {
      return this.deps!.git.changedFiles(job.taskId!).length > 0
    }
    // Rescan succeeds iff a status .md is new or newer than the pre-run snapshot.
    const before = this.statusSnapshots.get(job.id) ?? new Map<string, number>()
    const after = this.snapshotStatusDir()
    for (const [name, mtime] of after) {
      const prev = before.get(name)
      if (prev === undefined || mtime > prev) return true
    }
    return false
  }

  private snapshotStatusDir(): Map<string, number> {
    const snap = new Map<string, number>()
    const dir = this.deps!.store.statusDir
    try {
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        try { snap.set(f, statSync(path.join(dir, f)).mtimeMs) } catch { /* file vanished mid-scan */ }
      }
    } catch { /* status dir missing; treat as empty */ }
    return snap
  }

  // Returns a failure reason if the rescan introduced new tracked-file changes, else undefined.
  private checkRescanStray(job: Job): string | undefined {
    const before = this.porcelainSnapshots.get(job.id) ?? new Set<string>()
    const after = this.deps!.git.porcelain()
    const stray = after.filter((line) => !before.has(line))
    if (stray.length === 0) return undefined
    const paths = stray.map((l) => l.slice(3).trim()).join(', ')
    return `rescan touched files outside project-board/data/status: ${paths}`
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
