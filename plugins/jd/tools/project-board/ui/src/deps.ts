import type { BoardItem, ItemStatus } from './types.js'

// A dependency is "complete" (its work exists on a branch) once it reaches review,
// pr, or done. A dependent stacks on the dep's branch, so it can run BEFORE the dep
// is merged — that's what makes unattended overnight chains possible. Anything
// short of complete (backlog/ready/ai_running), a `cancelled` dep, or a missing id
// blocks the dependent. Self-references are ignored.
export const COMPLETE_STATES: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['review', 'pr', 'done'])

// Deps whose branch still exists unmerged (review/pr) must be stacked into the
// dependent's worktree. A `done` dep is already on main, so it needs no stacking.
export const UNMERGED_COMPLETE: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['review', 'pr'])

export function blockedBy(item: Pick<BoardItem, 'id' | 'dependsOn'>, byId: Map<string, BoardItem>): string[] {
  if (!item.dependsOn?.length) return []
  return item.dependsOn.filter((id) => id !== item.id && !COMPLETE_STATES.has(byId.get(id)?.status as ItemStatus))
}

export function isBlocked(item: Pick<BoardItem, 'id' | 'dependsOn'>, byId: Map<string, BoardItem>): boolean {
  return blockedBy(item, byId).length > 0
}

// Dep ids that are complete-but-unmerged (review/pr) — their branches must be
// merged into the dependent's worktree so it builds on top of their work.
export function unmergedDeps(item: Pick<BoardItem, 'id' | 'dependsOn'>, byId: Map<string, BoardItem>): string[] {
  if (!item.dependsOn?.length) return []
  return item.dependsOn.filter((id) => id !== item.id && UNMERGED_COMPLETE.has(byId.get(id)?.status as ItemStatus))
}

// Every task that (transitively) depends on `id`. Used to invalidate dependents
// when a dep is re-run/discarded — they were stacked on the now-stale branch.
export function transitiveDependents(id: string, items: BoardItem[]): BoardItem[] {
  const out: BoardItem[] = []
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const d of items) {
      if (d.dependsOn?.includes(cur) && !seen.has(d.id)) {
        seen.add(d.id)
        out.push(d)
        stack.push(d.id)
      }
    }
  }
  return out
}

export function indexById(items: BoardItem[]): Map<string, BoardItem> {
  return new Map(items.map((i) => [i.id, i]))
}
