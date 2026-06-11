import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { ServerDeps } from './server.js'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'
import { JobRunner, type GitOps } from './jobs/runner.js'

export function makeDeps(): ServerDeps {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'board-srv-'))
  for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
  const uiDistDir = path.join(dataDir, 'uidist')
  mkdirSync(uiDistDir, { recursive: true })
  writeFileSync(path.join(uiDistDir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>')
  mkdirSync(path.join(uiDistDir, 'assets'), { recursive: true })
  writeFileSync(path.join(uiDistDir, 'assets', 'app-test.js'), '/* hashed bundle */')
  const store = new BoardStore(dataDir)
  const hub = new WsHub()
  const git: GitOps = {
    createWorktree: () => dataDir,
    removeWorktree: () => {},
    changedFiles: () => [],
    branchDiff: () => 'diff --git a/x b/x',
    mergeBranch: () => {},
    createPr: () => 'https://github.com/example/pr/1',
    hasWorktree: () => true,
    worktreePath: () => dataDir,
  }
  const runner = new JobRunner({
    store,
    hub,
    git,
    jobsDir: store.jobsDir,
    claudeBin: 'claude',
    timeoutMs: 60_000,
    maxConcurrent: 1,
    spawnFn: () => {
      const proc = new EventEmitter() as unknown as ChildProcess
      ;(proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter()
      ;(proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter()
      ;(proc as unknown as { kill: () => void }).kill = () =>
        (proc as unknown as EventEmitter).emit('exit', 143)
      return proc
    },
  })
  return {
    config: {
      port: 0, host: '127.0.0.1', password: 'secret', repoRoot: dataDir,
      dataDir, jobTimeoutMs: 1000, maxConcurrentJobs: 1, claudeBin: 'claude',
      uiDistDir,
    },
    store,
    hub,
    runner,
    git,
  }
}
