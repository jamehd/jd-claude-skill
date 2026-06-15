import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url))

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' })
}

function newRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'reqcheck-'))
  sh('git', ['init', '-q'], root)
  sh('git', ['config', 'user.email', 't@t'], root)
  sh('git', ['config', 'user.name', 't'], root)
  mkdirSync(path.join(root, 'docs/requirements/components'), { recursive: true })
  writeFileSync(
    path.join(root, 'docs/requirements/components/cafe-service.md'),
    '## CAFE-R3: GetTheme\nServes branding.\n- AC: x\n',
  )
  writeFileSync(
    path.join(root, 'docs/requirements/.component-map.json'),
    JSON.stringify({
      components: [{ globs: ['cafe-service/**'], doc: 'cafe-service.md', prefixes: ['CAFE'] }],
      exclude: ['**/*.md', 'docs/**'],
    }),
  )
  mkdirSync(path.join(root, 'cafe-service'), { recursive: true })
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'init'], root)
  return root
}

function runCli(args, cwd) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

test('range mode fails when component code changed without a Req trailer', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: add api'], root)
  const r = runCli(['--range', 'HEAD~1..HEAD'], root)
  assert.equal(r.code, 1)
  assert.match(r.stderr, /missing Req anchor for cafe-service\.md/)
})

test('range mode passes when a defined Req trailer is present', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: add api\n\nReq: CAFE-R3'], root)
  const r = runCli(['--range', 'HEAD~1..HEAD'], root)
  assert.equal(r.code, 0)
})

test('range mode fails when the referenced id is undefined', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: add api\n\nReq: CAFE-R9'], root)
  const r = runCli(['--range', 'HEAD~1..HEAD'], root)
  assert.equal(r.code, 1)
  assert.match(r.stderr, /CAFE-R9 referenced but not defined/)
})

test('exits 0 silently when there is no component map', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nomapp-'))
  sh('git', ['init', '-q'], root)
  sh('git', ['config', 'user.email', 't@t'], root)
  sh('git', ['config', 'user.name', 't'], root)
  writeFileSync(path.join(root, 'a.txt'), 'x\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'init'], root)
  writeFileSync(path.join(root, 'b.txt'), 'y\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'change'], root)
  const r = runCli(['--range', 'HEAD~1..HEAD'], root)
  assert.equal(r.code, 0)
})

test('worktree advisory mode reminds but exits 0', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  const r = runCli(['--worktree', '--advisory'], root)
  assert.equal(r.code, 0)
  assert.match(r.stdout, /cafe-service\.md/)
})
