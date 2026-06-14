import { describe, it, expect } from 'vitest'
import { applyFilters, isShaped, isFilterActive, EMPTY_FILTER } from './filters.js'
import type { BoardItem } from './types.js'

function item(p: Partial<BoardItem>): BoardItem {
  return {
    id: 'TASK-001', type: 'task', title: 't', status: 'backlog', priority: 'P2',
    component: 'cafe-service', created: '2026-06-14', updated: '2026-06-14', body: 'b', ...p,
  }
}

describe('isShaped', () => {
  it('true only when plan has non-whitespace content', () => {
    expect(isShaped(item({ plan: 'real plan' }))).toBe(true)
    expect(isShaped(item({ plan: '   ' }))).toBe(false)
    expect(isShaped(item({ plan: undefined }))).toBe(false)
  })
})

describe('isFilterActive', () => {
  it('false for the empty filter, true once any axis is set', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, component: 'idc-backend' })).toBe(true)
    expect(isFilterActive({ ...EMPTY_FILTER, shaped: 'unshaped' })).toBe(true)
  })
})

describe('applyFilters', () => {
  const items = [
    item({ id: 'A', component: 'cafe-service', type: 'task', priority: 'P0', plan: 'p' }),
    item({ id: 'B', component: 'idc-backend', type: 'bug', priority: 'P2' }),
    item({ id: 'C', component: 'cafe-service', type: 'bug', priority: 'P0', plan: '' }),
  ]
  it('returns all for the empty filter', () => {
    expect(applyFilters(items, EMPTY_FILTER).map((i) => i.id)).toEqual(['A', 'B', 'C'])
  })
  it('filters by component', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, component: 'cafe-service' }).map((i) => i.id)).toEqual(['A', 'C'])
  })
  it('filters by shaped / unshaped', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, shaped: 'shaped' }).map((i) => i.id)).toEqual(['A'])
    expect(applyFilters(items, { ...EMPTY_FILTER, shaped: 'unshaped' }).map((i) => i.id)).toEqual(['B', 'C'])
  })
  it('filters by type and priority, AND-composed', () => {
    expect(applyFilters(items, { ...EMPTY_FILTER, type: 'bug', priority: 'P0' }).map((i) => i.id)).toEqual(['C'])
  })
})
