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
