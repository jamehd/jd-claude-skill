import type { BoardItem, ItemType, Priority } from './types.js'

export interface BoardFilter {
  component: string // 'all' or a component name
  shaped: 'all' | 'shaped' | 'unshaped'
  type: 'all' | ItemType
  priority: 'all' | Priority
}

export const EMPTY_FILTER: BoardFilter = Object.freeze({ component: 'all', shaped: 'all', type: 'all', priority: 'all' })

export function isShaped(item: BoardItem): boolean {
  return Boolean(item.plan?.trim())
}

/** The epic key a card belongs to (frontmatter `extra.epic`), or null when ungrouped. */
export function epicOf(item: BoardItem): string | null {
  const e = item.extra?.epic
  return typeof e === 'string' && e.trim() ? e.trim() : null
}

export function hasAnyEpic(items: BoardItem[]): boolean {
  return items.some((it) => epicOf(it) !== null)
}

export interface EpicGroup {
  epic: string | null // null = the "no epic" group
  items: BoardItem[]
}

/** Group cards by epic, epics sorted alphabetically with the no-epic group last. */
export function groupByEpic(items: BoardItem[]): EpicGroup[] {
  const byEpic = new Map<string, BoardItem[]>()
  const noEpic: BoardItem[] = []
  for (const it of items) {
    const e = epicOf(it)
    if (e === null) { noEpic.push(it); continue }
    const arr = byEpic.get(e)
    if (arr) arr.push(it)
    else byEpic.set(e, [it])
  }
  const groups: EpicGroup[] = [...byEpic.keys()].sort().map((epic) => ({ epic, items: byEpic.get(epic)! }))
  if (noEpic.length) groups.push({ epic: null, items: noEpic })
  return groups
}

export function isFilterActive(f: BoardFilter): boolean {
  return f.component !== 'all' || f.shaped !== 'all' || f.type !== 'all' || f.priority !== 'all'
}

export function applyFilters(items: BoardItem[], f: BoardFilter): BoardItem[] {
  return items.filter((it) => {
    if (f.component !== 'all' && it.component !== f.component) return false
    if (f.shaped === 'shaped' && !isShaped(it)) return false
    if (f.shaped === 'unshaped' && isShaped(it)) return false
    if (f.type !== 'all' && it.type !== f.type) return false
    if (f.priority !== 'all' && it.priority !== f.priority) return false
    return true
  })
}

export interface CandidateFilter {
  component: string // 'all' or a component name
  kind: 'all' | 'implement' | 'test'
  priority: 'all' | Priority
  type: 'all' | 'task' | 'bug'
}

export const EMPTY_CANDIDATE_FILTER: CandidateFilter =
  Object.freeze({ component: 'all', kind: 'all', priority: 'all', type: 'all' })

type CandidateFilterable = { component: string; kind: 'implement' | 'test'; priority: Priority; type: 'task' | 'bug' }

export function isCandidateFilterActive(f: CandidateFilter): boolean {
  return f.component !== 'all' || f.kind !== 'all' || f.priority !== 'all' || f.type !== 'all'
}

export function applyCandidateFilter<T extends CandidateFilterable>(rows: T[], f: CandidateFilter): T[] {
  return rows.filter((r) => {
    if (f.component !== 'all' && r.component !== f.component) return false
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    if (f.priority !== 'all' && r.priority !== f.priority) return false
    if (f.type !== 'all' && r.type !== f.type) return false
    return true
  })
}
