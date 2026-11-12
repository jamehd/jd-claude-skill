import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
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

test('range mode passes when a new requirement heading and its code land in the same range', () => {
  const root = newRepo()
  // add code + a brand-new requirement heading in one commit
  writeFileSync(path.join(root, 'cafe-service/new.go'), 'package main\n')
  const doc = path.join(root, 'docs/requirements/components/cafe-service.md')
  writeFileSync(doc, readFileSync(doc, 'utf8') + '\n## CAFE-R7: New thing\nDoes a new thing.\n- AC: works\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: new thing\n\nReq: CAFE-R7'], root)
  const r = runCli(['--range', 'HEAD~1..HEAD'], root)
  assert.equal(r.code, 0)
})

function writeProjectYaml(root, body) {
  mkdirSync(path.join(root, 'project-board'), { recursive: true })
  writeFileSync(path.join(root, 'project-board/project.yaml'), body)
}

test('reads requirements dir, map and id pattern from project.yaml', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'reqcheck-cfg-'))
  sh('git', ['init', '-q'], root)
  sh('git', ['config', 'user.email', 't@t'], root)
  sh('git', ['config', 'user.name', 't'], root)
  mkdirSync(path.join(root, 'reqs/specs'), { recursive: true })
  writeFileSync(path.join(root, 'reqs/specs/svc.md'), '## REQ-3: Thing\nText.\n')
  writeFileSync(
    path.join(root, 'reqs/map.json'),
    JSON.stringify({ components: [{ globs: ['svc/**'], doc: 'svc.md', prefixes: ['REQ'] }] }),
  )
  writeProjectYaml(
    root,
    'requirements:\n  dir: reqs\n  subdirs: [specs]\n  map: map.json\n  id_pattern: \'REQ-\\d+\'\n',
  )
  mkdirSync(path.join(root, 'svc'), { recursive: true })
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'init'], root)
  writeFileSync(path.join(root, 'svc/a.go'), 'package main\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: a\n\nReq: REQ-3'], root)
  assert.equal(runCli(['--range', 'HEAD~1..HEAD'], root).code, 0)
  writeFileSync(path.join(root, 'svc/b.go'), 'package main\n')
  sh('git', ['add', '-A'], root)
  sh('git', ['commit', '-qm', 'feat: b\n\nReq: REQ-99'], root)
  assert.equal(runCli(['--range', 'HEAD~1..HEAD'], root).code, 1)
})

test('prints nothing and exits 0 outside a git repository', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reqcheck-nogit-'))
  const r = runCli(['--worktree', '--advisory'], dir)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
})

test('malformed map JSON prints one line and exits 0', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'docs/requirements/.component-map.json'), '{ nope')
  const r = runCli(['--worktree', '--advisory'], root)
  assert.equal(r.code, 0)
  assert.equal(`${r.stdout}${r.stderr}`.trim().split('\n').length, 1)
})

test('--system-message wraps advisory output as JSON', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  const r = runCli(['--worktree', '--advisory', '--system-message'], root)
  assert.equal(r.code, 0)
  assert.match(JSON.parse(r.stdout).systemMessage, /requirements reminder/)
})

test('structurally invalid map prints one line and exits 0', () => {
  const root = newRepo()
  writeFileSync(path.join(root, 'docs/requirements/.component-map.json'), '{"components": 5}')
  writeFileSync(path.join(root, 'cafe-service/api.go'), 'package main\n')
  const r = runCli(['--worktree', '--advisory'], root)
  assert.equal(r.code, 0)
  assert.equal(`${r.stdout}${r.stderr}`.trim().split('\n').length, 1)
})
