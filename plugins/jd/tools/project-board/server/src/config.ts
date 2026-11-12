import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import dotenv from 'dotenv'
import { loadProjectConfig, resolveMainBranch, ProjectConfigError, type ProjectConfig } from './project-config.js'

export type Integration = 'pull-request' | 'merge-after-acceptance'

export interface Config {
  port: number
  host: string
  password?: string
  repoRoot: string
  dataDir: string
  featuresDir: string
  warnings: string[]
  jobTimeoutMs: number
  maxConcurrentJobs: number
  claudeBin: string
  uiDistDir?: string
  project: ProjectConfig
  mainBranch: string
  remoteName: string
  branchPrefix: string
  integration: Integration
  testShell?: string
  cookieName: string
}

const SETUP_HINT = 'run the jd:project-board setup skill (or create it by hand) before starting the board'

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function readEnvFile(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const file = env.BOARD_ENV_FILE
  if (!file) return env
  if (!existsSync(file)) throw new Error(`BOARD_ENV_FILE does not exist: ${file}`)
  return { ...dotenv.parse(readFileSync(file)), ...env }
}

function validPort(port: unknown, file: string): number {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ProjectConfigError(`${file}: "board.port" must be an integer between 1 and 65535`, { file, key: 'board.port' })
  }
  return port
}

function validIntegration(value: unknown, file: string): Integration {
  if (value !== 'pull-request' && value !== 'merge-after-acceptance') {
    throw new ProjectConfigError(`${file}: "git.integration" must be "pull-request" or "merge-after-acceptance"`, { file, key: 'git.integration' })
  }
  return value
}

function validBranchName(name: string): boolean {
  const r = spawnSync('git', ['check-ref-format', '--branch', name], { stdio: 'ignore' })
  return r.error ? !/\s|\.\.|^-/.test(name) : r.status === 0
}

function validateGitRefs(project: ProjectConfig, file: string): void {
  const bad = (key: string, value: string, what: string) =>
    new ProjectConfigError(`${file}: "${key}" is not ${what}: ${JSON.stringify(value)}`, { file, key })
  if (project.git.main !== undefined && !validBranchName(project.git.main)) {
    throw bad('git.main', project.git.main, 'a valid branch name')
  }
  if (!/^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(project.git.remote_name)) {
    throw bad('git.remote_name', project.git.remote_name, 'a valid remote name')
  }
  if (!validBranchName(`${project.board.branch_prefix}TASK-001`)) {
    throw bad('board.branch_prefix', project.board.branch_prefix, 'a valid branch prefix')
  }
}

export function loadConfig(processEnv: NodeJS.ProcessEnv = process.env): Config {
  const env = readEnvFile(processEnv)
  if (!env.BOARD_REPO_ROOT) throw new Error('BOARD_REPO_ROOT is required — absolute path to the target project repository')
  const repoRoot = path.resolve(env.BOARD_REPO_ROOT)
  const loaded = loadProjectConfig(repoRoot)
  if (!loaded.found) {
    throw new Error(`project-board/project.yaml not found in ${repoRoot} — ${SETUP_HINT}`)
  }
  const project = loaded.config
  validPort(project.board.port, loaded.path)
  validateGitRefs(project, loaded.path)
  if (env.BOARD_PORT !== undefined) {
    const envPort = Number(env.BOARD_PORT)
    if (!Number.isInteger(envPort) || envPort < 1 || envPort > 65535) {
      throw new Error(`BOARD_PORT must be an integer between 1 and 65535, got "${env.BOARD_PORT}"`)
    }
  }
  const port = num(env.BOARD_PORT, project.board.port)
  const dataDir = path.resolve(repoRoot, project.board.data_dir)
  const warnings: string[] = []
  const tasksPath = project.paths.tasks
  if (tasksPath && path.resolve(repoRoot, tasksPath) !== path.join(dataDir, 'tasks')) {
    warnings.push(`paths.tasks (${tasksPath}) differs from <board.data_dir>/tasks; the board reads and writes only ${path.join(dataDir, 'tasks')}`)
  }
  return {
    port,
    host: env.BOARD_HOST ?? '0.0.0.0',
    password: env.BOARD_PASSWORD,
    repoRoot,
    dataDir,
    featuresDir: project.paths.features ? path.resolve(repoRoot, project.paths.features) : path.join(dataDir, 'features'),
    warnings,
    jobTimeoutMs: num(env.BOARD_JOB_TIMEOUT_MS, 7_200_000),
    maxConcurrentJobs: num(env.BOARD_MAX_JOBS, 1),
    claudeBin: env.BOARD_CLAUDE_BIN ?? 'claude',
    uiDistDir: env.BOARD_UI_DIST,
    project,
    mainBranch: resolveMainBranch(repoRoot, project),
    remoteName: project.git.remote_name,
    branchPrefix: project.board.branch_prefix,
    testShell: env.BOARD_TEST_SHELL,
    integration: validIntegration(project.git.integration, loaded.path),
    cookieName: `board_session_${port}`,
  }
}
