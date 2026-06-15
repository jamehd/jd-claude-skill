import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseRequirementsDir } from '../../shared/requirements.mjs'
import { loadMap, classifyChanges } from './lib/map.mjs'
import { parseTrailers } from './lib/trailers.mjs'
import { evaluateRange, evaluateWorktree } from './lib/verdict.mjs'
import {
  repoRoot,
  changedFilesInRange,
  commitMessagesInRange,
  worktreeChangedFiles,
} from './lib/git.mjs'

function parseArgs(argv) {
  const args = { mode: null, range: null, advisory: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--range') { args.mode = 'range'; args.range = argv[++i] }
    else if (argv[i] === '--worktree') { args.mode = 'worktree' }
    else if (argv[i] === '--advisory') { args.advisory = true }
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const root = repoRoot(cwd)
  const mapPath = path.join(root, 'docs/requirements/.component-map.json')
  if (!existsSync(mapPath)) process.exit(0) // not a configured repo
  const map = loadMap(mapPath)

  if (args.mode === 'range') {
    const touched = classifyChanges(changedFilesInRange(args.range, root), map)
    if (touched.length === 0) process.exit(0)
    const trailers = parseTrailers(commitMessagesInRange(args.range, root))
    const definedIds = new Set(parseRequirementsDir(root).keys())
    const { ok, failures } = evaluateRange({ touched, trailers, definedIds })
    if (!ok) {
      console.error('✗ requirements drift:\n  - ' + failures.join('\n  - '))
      process.exit(1)
    }
    process.exit(0)
  }

  if (args.mode === 'worktree') {
    const changed = worktreeChangedFiles(root)
    const touched = classifyChanges(changed, map)
    const docFiles = new Set(map.components.map((c) => c.doc).filter(Boolean))
    const changedDocs = new Set(
      changed.map((f) => path.basename(f)).filter((b) => docFiles.has(b)),
    )
    const { reminders } = evaluateWorktree({ touched, changedDocs })
    // Advisory output goes to stdout so the Stop hook surfaces it as context to
    // the model; only blocking failures (range mode) go to stderr.
    if (reminders.length) console.log('⚠ requirements reminder:\n  - ' + reminders.join('\n  - '))
    process.exit(0) // advisory: never block
  }

  console.error('usage: cli.mjs --range <A..B> | --worktree [--advisory]')
  process.exit(2)
}

main()
