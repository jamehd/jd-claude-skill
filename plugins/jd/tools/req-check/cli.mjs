import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadProjectConfig, requirementIdRegex } from '../../shared/project-config.mjs'
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

function firstLine(e) {
  return (e && e.message ? e.message : String(e)).split('\n')[0]
}

function parseArgs(argv) {
  const args = { mode: null, range: null, advisory: false, systemMessage: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--range') {
      args.mode = 'range'; args.range = argv[++i]
      if (!args.range) { console.error('--range requires a value'); process.exit(2) }
    }
    else if (argv[i] === '--worktree') { args.mode = 'worktree' }
    else if (argv[i] === '--advisory') { args.advisory = true }
    else if (argv[i] === '--system-message') { args.systemMessage = true }
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  let root
  try { root = repoRoot(cwd) } catch { process.exit(0) } // not a git repo → no-op
  let reqCfg, config
  try {
    config = loadProjectConfig(root).config
    if (config.hooks?.req_check === false && args.advisory) process.exit(0)
    reqCfg = config.requirements
  } catch (e) {
    console.error(`req-check: ${firstLine(e)}; skipping`)
    process.exit(0)
  }
  const mapPath = path.join(root, reqCfg.dir, reqCfg.map)
  if (!existsSync(mapPath)) process.exit(0) // not a configured repo
  let map
  try { map = loadMap(mapPath) } catch (e) {
    console.error(`req-check: cannot read ${path.relative(root, mapPath)} (${firstLine(e)}); skipping`)
    process.exit(0)
  }

  if (args.mode === 'range') {
    let touched, trailers
    try {
      touched = classifyChanges(changedFilesInRange(args.range, root), map)
      if (touched.length === 0) process.exit(0)
      trailers = parseTrailers(commitMessagesInRange(args.range, root), requirementIdRegex(config))
    } catch (e) {
      const msg = (e && e.message ? e.message : String(e)).split('\n')[0]
      console.error(`req-check: could not evaluate range "${args.range}" (${msg}); skipping`)
      process.exit(0)
    }
    const definedIds = new Set(parseRequirementsDir(root, reqCfg).keys())
    const { ok, failures } = evaluateRange({ touched, trailers, definedIds })
    if (!ok) {
      console.error('✗ requirements drift:\n  - ' + failures.join('\n  - '))
      process.exit(1)
    }
    process.exit(0)
  }

  if (args.mode === 'worktree') {
    let reminders
    try {
      const changed = worktreeChangedFiles(root)
      const touched = classifyChanges(changed, map)
      const docFiles = new Set(map.components.map((c) => c.doc).filter(Boolean))
      const changedDocs = new Set(
        changed.map((f) => path.basename(f)).filter((b) => docFiles.has(b)),
      )
      ;({ reminders } = evaluateWorktree({ touched, changedDocs }))
    } catch (e) {
      console.error(`req-check: invalid component map ${path.relative(root, mapPath)} (${firstLine(e)}); skipping`)
      process.exit(0)
    }
    // Advisory output goes to stdout; only blocking failures (range mode) go to stderr.
    // Worktree mode is always advisory (never blocks); --advisory is accepted for explicitness.
    if (reminders.length) {
      const text = '⚠ requirements reminder:\n  - ' + reminders.join('\n  - ')
      console.log(args.systemMessage ? JSON.stringify({ systemMessage: text }) : text)
    }
    process.exit(0) // advisory: never block
  }

  console.error('usage: cli.mjs --range <A..B> | --worktree [--advisory]')
  process.exit(2)
}

main()
