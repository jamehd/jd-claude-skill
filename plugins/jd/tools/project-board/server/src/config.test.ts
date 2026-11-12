import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from './config.js'

let repo: string

function writeYaml(text: string) {
  mkdirSync(path.join(repo, 'project-board'), { recursive: true })
  writeFileSync(path.join(repo, 'project-board', 'project.yaml'), text)
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'board-cfg-'))
})

describe('loadConfig', () => {
  it('throws naming project-board/project.yaml when the file is missing', () => {
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo })).toThrow(/project-board\/project\.yaml/)
  })

  it('requires BOARD_REPO_ROOT', () => {
    expect(() => loadConfig({})).toThrow(/BOARD_REPO_ROOT/)
  })

  it('applies defaults for a partial project.yaml', () => {
    writeYaml('project: Demo\n')
    const c = loadConfig({ BOARD_REPO_ROOT: repo })
    expect(c.project.project).toBe('Demo')
    expect(c.port).toBe(4400)
    expect(c.dataDir).toBe(path.join(repo, 'project-board/data'))
    expect(c.remoteName).toBe('origin')
    expect(c.branchPrefix).toBe('board/')
    expect(c.integration).toBe('pull-request')
    expect(c.mainBranch).toBe('main')
    expect(c.cookieName).toBe('board_session_4400')
  })

  it('reads port, data_dir, main, remote, prefix, integration from config', () => {
    writeYaml([
      'project: Demo',
      'git:',
      '  main: master',
      '  remote_name: upstream',
      '  integration: merge-after-acceptance',
      'board:',
      '  port: 4510',
      '  data_dir: custom/data',
      '  branch_prefix: bd/',
    ].join('\n'))
    const c = loadConfig({ BOARD_REPO_ROOT: repo })
    expect(c.port).toBe(4510)
    expect(c.dataDir).toBe(path.join(repo, 'custom/data'))
    expect(c.mainBranch).toBe('master')
    expect(c.remoteName).toBe('upstream')
    expect(c.branchPrefix).toBe('bd/')
    expect(c.integration).toBe('merge-after-acceptance')
    expect(c.cookieName).toBe('board_session_4510')
  })

  it('env vars override config values', () => {
    writeYaml('board:\n  port: 4510\n')
    const c = loadConfig({ BOARD_REPO_ROOT: repo, BOARD_PORT: '4999' })
    expect(c.port).toBe(4999)
    expect(c.cookieName).toBe('board_session_4999')
  })

  it.each(['0', '70000', '1.5', 'abc'])('rejects board.port %s naming the key', (bad) => {
    writeYaml(`board:\n  port: ${bad}\n`)
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo })).toThrow(/board\.port/)
  })

  it('surfaces invalid YAML with the file name', () => {
    writeYaml('project: [unclosed\n')
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo })).toThrow(/project\.yaml/)
  })

  it('loads .env only from BOARD_ENV_FILE, real env wins', () => {
    writeYaml('project: Demo\n')
    const envFile = path.join(repo, 'custom.env')
    writeFileSync(envFile, 'BOARD_PASSWORD=from-file\nBOARD_HOST=1.2.3.4\n')
    writeFileSync(path.join(repo, '.env'), 'BOARD_PASSWORD=ignored\n')
    const c = loadConfig({ BOARD_REPO_ROOT: repo, BOARD_ENV_FILE: envFile, BOARD_HOST: '127.0.0.1' })
    expect(c.password).toBe('from-file')
    expect(c.host).toBe('127.0.0.1')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).password).toBeUndefined()
  })

  it('errors when BOARD_ENV_FILE does not exist', () => {
    writeYaml('project: Demo\n')
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo, BOARD_ENV_FILE: path.join(repo, 'nope.env') })).toThrow(/BOARD_ENV_FILE/)
  })

  it.each(['0', '70000', 'abc'])('rejects BOARD_PORT env %s', (bad) => {
    writeYaml('project: Demo\n')
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo, BOARD_PORT: bad })).toThrow(/BOARD_PORT/)
  })

  it('takes testShell from BOARD_ENV_FILE values', () => {
    writeYaml('project: Demo\n')
    const envFile = path.join(repo, 'custom.env')
    writeFileSync(envFile, 'BOARD_TEST_SHELL=bash\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo, BOARD_ENV_FILE: envFile }).testShell).toBe('bash')
  })

  it('resolves featuresDir from paths.features, else <data_dir>/features', () => {
    writeYaml('project: Demo\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).featuresDir).toBe(path.join(repo, 'project-board/data/features'))
    writeYaml('paths:\n  features: docs/features\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).featuresDir).toBe(path.join(repo, 'docs/features'))
  })

  it('warns when paths.tasks differs from <data_dir>/tasks', () => {
    writeYaml('project: Demo\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).warnings).toEqual([])
    writeYaml('paths:\n  tasks: project-board/data/tasks\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).warnings).toEqual([])
    writeYaml('paths:\n  tasks: docs/tasks\n')
    const w = loadConfig({ BOARD_REPO_ROOT: repo }).warnings
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/paths\.tasks.*docs\/tasks/)
  })

  it('passes tasks.id_prefix through', () => {
    writeYaml('tasks:\n  id_prefix: T\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).project.tasks.id_prefix).toBe('T')
  })

  it.each([
    ['git:\n  main: "bad branch"', /git\.main/],
    ['git:\n  main: "-x"', /git\.main/],
    ['git:\n  main: "a..b"', /git\.main/],
    ['git:\n  remote_name: "-evil"', /git\.remote_name/],
    ['git:\n  remote_name: "a b"', /git\.remote_name/],
    ['board:\n  branch_prefix: "bad prefix/"', /board\.branch_prefix/],
    ['board:\n  branch_prefix: "-x/"', /board\.branch_prefix/],
    ['board:\n  branch_prefix: "a..b/"', /board\.branch_prefix/],
  ])('rejects invalid git ref value %s', (yamlText, re) => {
    writeYaml(yamlText)
    expect(() => loadConfig({ BOARD_REPO_ROOT: repo })).toThrow(re)
  })

  it('accepts valid git refs', () => {
    writeYaml('git:\n  main: release/1.0\n  remote_name: my-remote.2\nboard:\n  branch_prefix: bd/\n')
    expect(loadConfig({ BOARD_REPO_ROOT: repo }).mainBranch).toBe('release/1.0')
  })
})
