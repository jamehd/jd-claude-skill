import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type * as Shared from '../../../../shared/project-config.mjs'
import type { ProjectConfig } from '../../../../shared/project-config.mjs'

export type { ProjectConfig, LoadedProjectConfig } from '../../../../shared/project-config.mjs'

export function findShared(file: string): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'shared', file)
    if (existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }
  throw new Error(`shared/${file} not found next to the project-board tool`)
}

// Loaded with require(esm) (Node >= 22.12): Vite's dynamic-import transform cannot load plugin paths that contain spaces.
const shared = createRequire(import.meta.url)(findShared('project-config.mjs')) as typeof Shared

export const { loadProjectConfig, requirementIdRegex, resolveMainBranch, ProjectConfigError } = shared

export function defaultProjectConfig(): ProjectConfig {
  return shared.loadProjectConfig(path.join(os.tmpdir(), 'jd-board-no-project')).config
}
