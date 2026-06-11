import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export class BoardGit {
  constructor(readonly repoRoot: string) {}

  private assertSafeId(taskId: string): void {
    if (!SAFE_ID.test(taskId)) throw new Error(`invalid task id: ${taskId}`)
  }

  private git(args: string[], cwd = this.repoRoot): string {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    } catch (e: unknown) {
      const stderr = (e as { stderr?: string }).stderr?.trim()
      const base = e instanceof Error ? e.message : String(e)
      throw new Error(stderr ? `${stderr}\n${base}` : base)
    }
  }

  worktreePath(taskId: string): string {
    return path.join(this.repoRoot, '.board-worktrees', taskId)
  }

  branchName(taskId: string): string {
    return `board/${taskId}`
  }

  createWorktree(taskId: string): string {
    this.assertSafeId(taskId)
    // Always tear down leftovers so re-dispatch after a kept-for-inspection failure starts fresh
    this.removeWorktree(taskId)
    const wt = this.worktreePath(taskId)
    mkdirSync(path.dirname(wt), { recursive: true })
    this.git(['worktree', 'add', '-b', this.branchName(taskId), wt, 'main'])
    return wt
  }

  hasWorktree(taskId: string): boolean {
    this.assertSafeId(taskId)
    return existsSync(this.worktreePath(taskId))
  }

  removeWorktree(taskId: string): void {
    this.assertSafeId(taskId)
    try { this.git(['worktree', 'remove', '--force', this.worktreePath(taskId)]) } catch { /* already gone */ }
    try { this.git(['branch', '-D', this.branchName(taskId)]) } catch { /* already gone */ }
  }

  branchDiff(taskId: string): string {
    this.assertSafeId(taskId)
    return this.git(['diff', `main...${this.branchName(taskId)}`])
  }

  changedFiles(taskId: string): string[] {
    this.assertSafeId(taskId)
    return this.git(['diff', '--name-only', `main...${this.branchName(taskId)}`])
      .split('\n').filter(Boolean)
  }

  mergeBranch(taskId: string, message: string): void {
    this.assertSafeId(taskId)
    // Ignore untracked files (e.g. .board-worktrees/) — only staged/modified tracked files block the merge
    if (this.git(['status', '--porcelain', '--untracked-files=no']).trim() !== '') {
      throw new Error('main working tree is dirty; commit or stash before merging')
    }
    const branch = this.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    if (branch !== 'main') throw new Error(`repo is on ${branch}, expected main`)
    this.git(['merge', '--squash', this.branchName(taskId)])
    try {
      this.git(['commit', '-m', message])
    } catch (err) {
      // The squash staged changes but the commit failed (hooks, signing, etc.).
      // The dirty-tree guard above proves the tree was clean before the squash, so
      // everything staged came from it — reset --hard restores the pre-merge state.
      try { this.git(['reset', '--hard', 'HEAD']) } catch { /* best effort; surface the original error */ }
      throw err
    }
    this.removeWorktree(taskId)
  }

  // Pushes the branch and opens a GitHub PR; requires `gh` CLI and a configured remote.
  createPr(taskId: string, title: string, body: string): string {
    this.assertSafeId(taskId)
    this.git(['push', '-u', 'origin', this.branchName(taskId)])
    try {
      return execFileSync('gh',
        ['pr', 'create', '--head', this.branchName(taskId), '--title', title, '--body', body],
        { cwd: this.repoRoot, encoding: 'utf8' }).trim()
    } catch (e: unknown) {
      const stderr = (e as { stderr?: string }).stderr?.trim()
      const base = e instanceof Error ? e.message : String(e)
      throw new Error(stderr ? `${stderr}\n${base}` : base)
    }
  }
}
