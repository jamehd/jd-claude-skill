import { execFileSync } from 'node:child_process'

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

export function repoRoot(cwd) {
  return git(['rev-parse', '--show-toplevel'], cwd).trim()
}

export function changedFilesInRange(range, cwd) {
  return git(['diff', '--name-only', range], cwd).split('\n').filter(Boolean)
}

export function commitMessagesInRange(range, cwd) {
  // NUL-delimited bodies so multi-line messages stay separable.
  const out = git(['log', '--format=%B%x00', range], cwd)
  return out.split('\0').map((s) => s.trim()).filter(Boolean)
}

export function worktreeChangedFiles(cwd) {
  const tracked = git(['diff', '--name-only', 'HEAD'], cwd).split('\n').filter(Boolean)
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd).split('\n').filter(Boolean)
  return [...new Set([...tracked, ...untracked])]
}
