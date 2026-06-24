import { describe, it, expect } from 'vitest'
import { applyFilters, isShaped, isFilterActive, EMPTY_FILTER, applyCandidateFilter, isCandidateFilterActive, EMPTY_CANDIDATE_FILTER, epicOf, hasAnyEpic, groupByEpic } from './filters.js'
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

describe('epicOf', () => {
  it('reads a trimmed extra.epic, else null', () => {
    expect(epicOf(item({ extra: { epic: 'GAME-LIFECYCLE' } }))).toBe('GAME-LIFECYCLE')
    expect(epicOf(item({ extra: { epic: '  GAME-LIFECYCLE  ' } }))).toBe('GAME-LIFECYCLE')
    expect(epicOf(item({ extra: { epic: '   ' } }))).toBeNull()
    expect(epicOf(item({ extra: { epic: 42 } }))).toBeNull()
    expect(epicOf(item({}))).toBeNull()
  })
})

describe('groupByEpic', () => {
  it('groups by epic, sorts epics, puts no-epic group last', () => {
    const items = [
      item({ id: 'A', extra: { epic: 'ZED' } }),
      item({ id: 'B' }),
      item({ id: 'C', extra: { epic: 'ALPHA' } }),
      item({ id: 'D', extra: { epic: 'ZED' } }),
    ]
    const groups = groupByEpic(items)
    expect(groups.map((g) => g.epic)).toEqual(['ALPHA', 'ZED', null])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['C'], ['A', 'D'], ['B']])
  })
  it('omits the no-epic group when every card has an epic', () => {
    const groups = groupByEpic([item({ id: 'A', extra: { epic: 'X' } })])
    expect(groups.map((g) => g.epic)).toEqual(['X'])
  })
  it('hasAnyEpic is false when no card carries an epic', () => {
    expect(hasAnyEpic([item({}), item({ extra: { foo: 'bar' } })])).toBe(false)
    expect(hasAnyEpic([item({}), item({ extra: { epic: 'X' } })])).toBe(true)
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

describe('candidate filters', () => {
  type C = { component: string; kind: 'implement' | 'test'; priority: 'P0' | 'P1' | 'P2' | 'P3'; type: 'task' | 'bug' }
  const rows: C[] = [
    { component: 'cafe-service', kind: 'implement', priority: 'P1', type: 'task' },
    { component: 'idc-backend', kind: 'test', priority: 'P2', type: 'task' },
    { component: 'cafe-service', kind: 'test', priority: 'P0', type: 'bug' },
  ]

  it('isCandidateFilterActive is false only for the empty filter', () => {
    expect(isCandidateFilterActive(EMPTY_CANDIDATE_FILTER)).toBe(false)
    expect(isCandidateFilterActive({ ...EMPTY_CANDIDATE_FILTER, kind: 'test' })).toBe(true)
    expect(isCandidateFilterActive({ ...EMPTY_CANDIDATE_FILTER, component: 'idc-backend' })).toBe(true)
  })

  it('empty filter returns all rows', () => {
    expect(applyCandidateFilter(rows, EMPTY_CANDIDATE_FILTER)).toHaveLength(3)
  })

  it('filters by component, kind, priority, type and AND-composes', () => {
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, component: 'cafe-service' })).toHaveLength(2)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, kind: 'test' })).toHaveLength(2)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, priority: 'P0' })).toHaveLength(1)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, type: 'bug' })).toHaveLength(1)
    const both = applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, component: 'cafe-service', kind: 'test' })
    expect(both).toHaveLength(1)
    expect(both[0].priority).toBe('P0')
  })
})
