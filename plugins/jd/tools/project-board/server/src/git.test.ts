import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { BoardGit } from './jobs/git.js'

let repo: string
let git: BoardGit

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'board-git-'))
  sh(repo, 'init', '-b', 'main')
  sh(repo, 'config', 'user.email', 'test@test')
  sh(repo, 'config', 'user.name', 'test')
  writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-m', 'init')
  git = new BoardGit(repo)
})

describe('BoardGit', () => {
  it('creates and removes a worktree with branch', () => {
    const wt = git.createWorktree('TASK-001')
    expect(wt).toContain('.board-worktrees')
    expect(sh(repo, 'branch', '--list', 'board/TASK-001').trim()).not.toBe('')
    git.removeWorktree('TASK-001')
    expect(sh(repo, 'branch', '--list', 'board/TASK-001').trim()).toBe('')
  })

  it('produces a diff for branch changes', () => {
    const wt = git.createWorktree('TASK-002')
    writeFileSync(path.join(wt, 'a.txt'), 'changed\n')
    sh(wt, 'commit', '-am', 'change')
    expect(git.branchDiff('TASK-002')).toContain('-hello')
    git.removeWorktree('TASK-002')
  })

  it('squash-merges a branch into main and cleans up', () => {
    const wt = git.createWorktree('TASK-003')
    writeFileSync(path.join(wt, 'b.txt'), 'new file\n')
    sh(wt, 'add', '.')
    sh(wt, 'commit', '-m', 'add b')
    git.mergeBranch('TASK-003', 'board: TASK-003 add b')
    expect(sh(repo, 'log', '--oneline', '-1')).toContain('TASK-003')
    expect(sh(repo, 'branch', '--list', 'board/TASK-003').trim()).toBe('')
  })

  it('refuses to merge when the main working tree is dirty', () => {
    git.createWorktree('TASK-004')
    writeFileSync(path.join(repo, 'a.txt'), 'dirty\n')
    expect(() => git.mergeBranch('TASK-004', 'msg')).toThrow(/dirty|clean/i)
    git.removeWorktree('TASK-004')
  })

  it('re-creating a worktree after a kept failure starts fresh', () => {
    const wt1 = git.createWorktree('TASK-005')
    writeFileSync(path.join(wt1, 'c.txt'), 'kept\n')
    sh(wt1, 'add', '.')
    sh(wt1, 'commit', '-m', 'kept work')
    const wt2 = git.createWorktree('TASK-005')
    expect(git.branchDiff('TASK-005')).toBe('')
    git.removeWorktree('TASK-005')
  })

  // Finding 1: path-traversal guard
  it('rejects path-traversal task id in createWorktree', () => {
    expect(() => git.createWorktree('../../escape')).toThrow(/invalid task id/)
  })

  it('rejects slash-separated task id in removeWorktree', () => {
    expect(() => git.removeWorktree('a/b')).toThrow(/invalid task id/)
  })

  it('accepts valid task ids (TASK-001, BUG-002, RESCAN)', () => {
    for (const id of ['TASK-001', 'BUG-002', 'RESCAN']) {
      expect(() => git.worktreePath(id)).not.toThrow()
    }
  })

  it('rejects task ids with leading dot, spaces, or double-dot', () => {
    for (const id of ['.hidden', '.. ', '  spaces', '..']) {
      expect(() => git.createWorktree(id)).toThrow(/invalid task id/)
    }
  })

  it('rolls back the staged squash when the commit fails, allowing recovery', () => {
    const wt = git.createWorktree('TASK-006')
    writeFileSync(path.join(wt, 'd.txt'), 'merge me\n')
    sh(wt, 'add', '.')
    sh(wt, 'commit', '-m', 'add d')

    // Failing pre-commit hook makes the follow-up commit throw after the squash stages changes
    const hooksDir = path.join(repo, '.git-hooks')
    mkdirSync(hooksDir)
    writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    sh(repo, 'config', 'core.hooksPath', hooksDir)

    expect(() => git.mergeBranch('TASK-006', 'board: TASK-006 add d')).toThrow()
    // Rollback happened: no tracked changes remain staged from the squash
    // (untracked worktree dirs are ignored, matching the merge guard's semantics)
    expect(sh(repo, 'status', '--porcelain', '--untracked-files=no').trim()).toBe('')

    // Recovery: with the hook gone, merging again succeeds (worktree/branch survived the failure)
    sh(repo, 'config', '--unset', 'core.hooksPath')
    git.mergeBranch('TASK-006', 'board: TASK-006 add d')
    expect(sh(repo, 'log', '--oneline', '-1')).toContain('TASK-006')
    expect(sh(repo, 'branch', '--list', 'board/TASK-006').trim()).toBe('')
  })

  it('hasWorktree reflects existence', () => {
    expect(git.hasWorktree('TASK-010')).toBe(false)
    git.createWorktree('TASK-010')
    expect(git.hasWorktree('TASK-010')).toBe(true)
    git.removeWorktree('TASK-010')
    expect(git.hasWorktree('TASK-010')).toBe(false)
  })

  // Finding 2: git stderr surfaced in thrown error
  it('surfaces git stderr when a git command fails', () => {
    // branchDiff on a non-existent branch triggers exit 128 with "fatal: ..." stderr
    expect(() => git.branchDiff('NOPE')).toThrow(/fatal|unknown revision/i)
  })

  it('deleteRemoteBranch removes the pushed board/<id> ref from origin', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'board-remote-'))
    sh(bare, 'init', '--bare', '-b', 'main')
    sh(repo, 'remote', 'add', 'origin', bare)
    git.createWorktree('TASK-200')
    sh(repo, 'push', 'origin', 'board/TASK-200')
    expect(sh(repo, 'ls-remote', '--heads', 'origin', 'board/TASK-200').trim()).not.toBe('')
    git.deleteRemoteBranch('TASK-200')
    expect(sh(repo, 'ls-remote', '--heads', 'origin', 'board/TASK-200').trim()).toBe('')
    git.removeWorktree('TASK-200')
  })

  it('on a squash conflict with main, throws and leaves main clean (no conflict markers)', () => {
    const wt = git.createWorktree('TASK-007')            // branched from main (a.txt = hello)
    writeFileSync(path.join(wt, 'a.txt'), 'branch change\n')
    sh(wt, 'commit', '-am', 'branch edit')
    // main diverges on the same file so the squash must conflict
    writeFileSync(path.join(repo, 'a.txt'), 'main change\n')
    sh(repo, 'commit', '-am', 'main edit')

    expect(() => git.mergeBranch('TASK-007', 'board: TASK-007')).toThrow(/conflict/i)
    // reset --hard undid the conflicted squash → tracked files are clean (the kept
    // .board-worktrees/ dir is untracked, matching the merge guard's semantics)
    expect(sh(repo, 'status', '--porcelain', '--untracked-files=no').trim()).toBe('')
    // a.txt is main's committed version, not a conflict-markered hybrid
    expect(sh(repo, 'show', 'HEAD:a.txt')).toContain('main change')
    expect(sh(repo, 'show', 'HEAD:a.txt')).not.toContain('<<<<<<<')
    git.removeWorktree('TASK-007')
  })
})
