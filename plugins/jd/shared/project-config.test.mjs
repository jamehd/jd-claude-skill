import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { loadProjectConfig, ProjectConfigError, requirementIdRegex, resolveMainBranch } from './project-config.mjs'

function makeRepo(yaml, dirName = 'repo') {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'pc-')), dirName)
  mkdirSync(path.join(root, 'project-board'), { recursive: true })
  if (yaml !== undefined) writeFileSync(path.join(root, 'project-board', 'project.yaml'), yaml)
  return root
}

test('missing file returns found:false with all defaults', () => {
  const root = makeRepo(undefined, 'my-proj')
  const r = loadProjectConfig(root)
  assert.equal(r.found, false)
  assert.equal(r.path, path.join(root, 'project-board', 'project.yaml'))
  const c = r.config
  assert.equal(c.project, 'my-proj')
  assert.equal(c.git.integration, 'pull-request')
  assert.equal(c.git.remote_name, 'origin')
  assert.equal(c.git.branch_pattern, 'feat/<ID>-<slug>')
  assert.equal(c.board.branch_prefix, 'board/')
  assert.equal(c.board.port, 4400)
  assert.equal(c.board.data_dir, 'project-board/data')
  assert.equal(c.tasks.id_prefix, 'TASK')
  assert.equal(c.requirements.dir, 'docs/requirements')
  assert.deepEqual(c.requirements.subdirs, ['components', 'capabilities'])
  assert.equal(c.requirements.map, '.component-map.json')
  assert.equal(c.requirements.id_pattern, '[A-Z]{2,6}-R\\d+')
  assert.deepEqual(c.requirements.headings, { description: 'Description', acceptance: 'Acceptance criteria' })
  assert.deepEqual(c.models, { large_task: 'opus', small_task: 'sonnet' })
  assert.deepEqual(c.audits, { always: ['jd:error-audit'], when_ui: ['jd:ui-design-audit'], when_schema: ['jd:db-audit'] })
  assert.deepEqual(c.hooks, { req_check: true, conventions: true })
  assert.deepEqual(c.limits, { fix_attempts: 3, rework_rounds: 2, features_active: 1 })
  assert.equal(c.language.docs, 'en')
})

test('NetbarBox-shaped partial file keeps P1 values and defaults new keys', () => {
  const root = makeRepo([
    'project: netbarbox_platform',
    'language: { owner: vi, docs: en }',
    'audits:',
    '  always: [jd:error-audit, jd:ui-design-audit]',
    '  when_schema: [jd:db-audit]',
    '  ui_design_source: mobile/DESIGN_SYSTEM.md',
    'limits: { fix_attempts: 3, rework_rounds: 2, features_active: 1 }',
    'git:',
    '  main: main',
    '  branch_pattern: "feat/<ID>-<slug>"',
    'actions:',
    '  test_all: { run: "task test", pending: true }',
    ''
  ].join('\n'))
  const r = loadProjectConfig(root)
  assert.equal(r.found, true)
  const c = r.config
  assert.equal(c.project, 'netbarbox_platform')
  assert.equal(c.language.owner, 'vi')
  assert.deepEqual(c.audits.always, ['jd:error-audit', 'jd:ui-design-audit'])
  assert.deepEqual(c.audits.when_ui, ['jd:ui-design-audit'])
  assert.equal(c.audits.ui_design_source, 'mobile/DESIGN_SYSTEM.md')
  assert.equal(c.limits.fix_attempts, 3)
  assert.equal(c.git.main, 'main')
  assert.equal(c.git.integration, 'pull-request')
  assert.equal(c.board.port, 4400)
  assert.equal(c.tasks.id_prefix, 'TASK')
  assert.deepEqual(c.actions.test_all, { run: 'task test', pending: true })
})

test('the real NetbarBox project.yaml loads when NETBAR_ROOT is set', { skip: !process.env.NETBAR_ROOT }, () => {
  const r = loadProjectConfig(process.env.NETBAR_ROOT)
  assert.equal(r.found, true)
  assert.equal(r.config.limits.fix_attempts, 3)
})

test('user values override defaults per key and unknown keys survive', () => {
  const root = makeRepo('tasks: { id_prefix: T }\nrequirements: { dir: reqs }\nextra: { a: 1 }\n')
  const c = loadProjectConfig(root).config
  assert.equal(c.tasks.id_prefix, 'T')
  assert.equal(c.requirements.dir, 'reqs')
  assert.equal(c.requirements.map, '.component-map.json')
  assert.deepEqual(c.requirements.subdirs, ['components', 'capabilities'])
  assert.deepEqual(c.extra, { a: 1 })
})

test('empty file and null sections fall back to defaults', () => {
  assert.equal(loadProjectConfig(makeRepo('')).config.board.port, 4400)
  const c = loadProjectConfig(makeRepo('board:\ngit:\n')).config
  assert.equal(c.board.port, 4400)
  assert.equal(c.git.remote_name, 'origin')
})

test('invalid YAML throws ProjectConfigError with file', () => {
  const root = makeRepo('a: [unclosed\n')
  assert.throws(() => loadProjectConfig(root), (e) => {
    assert.ok(e instanceof ProjectConfigError)
    assert.equal(e.file, path.join(root, 'project-board', 'project.yaml'))
    return true
  })
})

test('non-mapping root throws ProjectConfigError', () => {
  assert.throws(() => loadProjectConfig(makeRepo('- a\n- b\n')), ProjectConfigError)
})

test('wrong types throw with key', () => {
  const cases = [
    ['limits: { fix_attempts: "x" }', 'limits.fix_attempts'],
    ['board: { port: "4400" }', 'board.port'],
    ['requirements: { subdirs: components }', 'requirements.subdirs'],
    ['tasks: { id_prefix: 5 }', 'tasks.id_prefix'],
    ['hooks: { req_check: "yes" }', 'hooks.req_check'],
    ['git: oops', 'git'],
    ['requirements: { id_pattern: "[" }', 'requirements.id_pattern']
  ]
  for (const [yaml, key] of cases) {
    assert.throws(() => loadProjectConfig(makeRepo(yaml)), (e) => {
      assert.ok(e instanceof ProjectConfigError, yaml)
      assert.equal(e.key, key)
      assert.ok(e.file.endsWith('project.yaml'))
      return true
    })
  }
})

test('path with spaces works', () => {
  const root = makeRepo('tasks: { id_prefix: SP }\n', 'dir with spaces')
  assert.equal(loadProjectConfig(root).config.tasks.id_prefix, 'SP')
})

test('requirementIdRegex is global, word-bounded and uses the configured pattern', () => {
  const re = requirementIdRegex(loadProjectConfig(makeRepo(undefined)).config)
  assert.ok(re.global)
  assert.deepEqual('see AB-R1 and XYZ-R22, not xAB-R1'.match(re), ['AB-R1', 'XYZ-R22'])
  const custom = requirementIdRegex({ requirements: { id_pattern: 'REQ-\\d+' } })
  assert.deepEqual('REQ-7 REQ-12'.match(custom), ['REQ-7', 'REQ-12'])
})

test('resolveMainBranch prefers config, then origin/HEAD, then main', () => {
  const plain = makeRepo(undefined)
  const cfg = loadProjectConfig(plain).config
  assert.equal(resolveMainBranch(plain, cfg), 'main')
  assert.equal(resolveMainBranch(plain, { ...cfg, git: { ...cfg.git, main: 'trunk' } }), 'trunk')

  const repo = makeRepo(undefined)
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' })
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x')
  git('update-ref', 'refs/remotes/origin/develop', 'HEAD')
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop')
  assert.equal(resolveMainBranch(repo, cfg), 'develop')
})
