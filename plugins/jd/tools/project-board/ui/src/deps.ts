import type { BoardItem } from './types.js'

// A dependency is "satisfied" only when the referenced task is `done` (merged to
// main) — a dependent's jd:auto job runs off main and needs the dep's code there.
// Anything else blocks: an unmet/in-progress dep, a missing id, or a `cancelled`
// dep (operator must resolve it). Self-references are ignored.
export function blockedBy(item: Pick<BoardItem, 'id' | 'dependsOn'>, byId: Map<string, BoardItem>): string[] {
  if (!item.dependsOn?.length) return []
  return item.dependsOn.filter((id) => id !== item.id && byId.get(id)?.status !== 'done')
}

export function isBlocked(item: Pick<BoardItem, 'id' | 'dependsOn'>, byId: Map<string, BoardItem>): boolean {
  return blockedBy(item, byId).length > 0
}

export function indexById(items: BoardItem[]): Map<string, BoardItem> {
  return new Map(items.map((i) => [i.id, i]))
}
