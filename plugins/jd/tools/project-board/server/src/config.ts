import 'dotenv/config'
import path from 'node:path'

export interface Config {
  port: number
  host: string
  password?: string
  repoRoot: string
  dataDir: string
  jobTimeoutMs: number
  maxConcurrentJobs: number
  claudeBin: string
  uiDistDir?: string
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.BOARD_REPO_ROOT) throw new Error('BOARD_REPO_ROOT is required — absolute path to the target project repository')
  const repoRoot = path.resolve(env.BOARD_REPO_ROOT)
  return {
    port: num(env.BOARD_PORT, 4400),
    host: env.BOARD_HOST ?? '0.0.0.0',
    password: env.BOARD_PASSWORD,
    repoRoot,
    dataDir: path.join(repoRoot, 'project-board/data'),
    jobTimeoutMs: num(env.BOARD_JOB_TIMEOUT_MS, 7_200_000),
    maxConcurrentJobs: num(env.BOARD_MAX_JOBS, 1),
    claudeBin: env.BOARD_CLAUDE_BIN ?? 'claude',
    uiDistDir: env.BOARD_UI_DIST,
  }
}
