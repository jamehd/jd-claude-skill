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
