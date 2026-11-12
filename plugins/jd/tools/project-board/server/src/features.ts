import { existsSync } from 'node:fs'
import path from 'node:path'
import { SAFE_ID } from './jobs/git.js'
import type { BoardItem } from '../../ui/src/types.js'

export const MANAGED_MESSAGE = 'managed by feature-flow'

export function isFeatureManaged(task: Pick<BoardItem, 'extra'>, dataDir: string): boolean {
  const epic = task.extra?.epic
  if (typeof epic !== 'string' || !SAFE_ID.test(epic)) return false
  return existsSync(path.join(dataDir, 'features', epic, 'feature.md'))
}
