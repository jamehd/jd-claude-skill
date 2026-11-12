import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('./req-check-stop', import.meta.url))

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function repo(withSpace = false) {
  const base = mkdtempSync(path.join(tmpdir(), 'hook-'))
  const root = withSpace ? path.join(base, 'my repo') : base
  mkdirSync(path.join(root, 'svc'), { recursive: true })
  git(['init', '-q'], root)
  git(['config', 'user.email', 't@t'], root)
  git(['config', 'user.name', 't'], root)
  writeFileSync(path.join(root, 'svc/a.go'), 'x\n')
  mkdirSync(path.join(root, 'docs/requirements'), { recursive: true })
  writeFileSync(
    path.join(root, 'docs/requirements/.component-map.json'),
    JSON.stringify({ components: [{ globs: ['svc/**'], doc: 'a.md', prefixes: ['A'] }] }),
  )
  git(['add', '-A'], root)
  git(['commit', '-qm', 'init'], root)
  writeFileSync(path.join(root, 'svc/a.go'), 'y\n')
  return root
}

function yaml(root, body) {
  mkdirSync(path.join(root, 'project-board'), { recursive: true })
  writeFileSync(path.join(root, 'project-board/project.yaml'), body)
}

function runHook(cwd) {
  return execFileSync('bash', [HOOK], { cwd, encoding: 'utf8' })
}

test('no project.yaml: no output', () => {
  assert.equal(runHook(repo()), '')
})

test('hooks.req_check false: no output', () => {
  const root = repo()
  yaml(root, 'hooks:\n  req_check: false\n')
  assert.equal(runHook(root), '')
})

test('project.yaml without a map file: no output', () => {
  const root = repo()
  yaml(root, 'requirements:\n  map: missing.json\n')
  assert.equal(runHook(root), '')
})

test('configured map in a path with a space: systemMessage JSON', () => {
  const root = repo(true)
  yaml(root, 'project: x\nhooks:\n  req_check: true\n')
  assert.match(JSON.parse(runHook(root)).systemMessage, /requirements reminder/)
})

test('custom dir and map from project.yaml are honoured', () => {
  const root = repo()
  mkdirSync(path.join(root, 'reqs'))
  writeFileSync(
    path.join(root, 'reqs/m.json'),
    JSON.stringify({ components: [{ globs: ['svc/**'], doc: 'a.md', prefixes: ['A'] }] }),
  )
  yaml(root, 'requirements:\n  dir: reqs\n  map: m.json\n')
  assert.match(JSON.parse(runHook(root)).systemMessage, /requirements reminder/)
})
