import { describe, it, expect } from 'vitest'
import { blockedBy, isBlocked, unmergedDeps, transitiveDependents, indexById } from './deps.js'
import type { BoardItem } from './types.js'

function item(p: Partial<BoardItem>): BoardItem {
  return {
    id: 'TASK-001', type: 'task', title: 't', status: 'ready', priority: 'P2',
    component: 'idc_backend', created: '2026-06-24', updated: '2026-06-24', body: 'b', ...p,
  }
}
const dep = (id: string, status: BoardItem['status']) => item({ id, status })

describe('blockedBy / isBlocked — satisfied when dep work is complete (review/pr/done)', () => {
  it('no deps → never blocked', () => {
    expect(isBlocked(item({ id: 'A' }), indexById([]))).toBe(false)
  })
  it('review / pr / done all satisfy (dependent can stack before merge)', () => {
    for (const s of ['review', 'pr', 'done'] as const) {
      const byId = indexById([dep('TASK-008', s)])
      expect(isBlocked(item({ id: 'A', dependsOn: ['TASK-008'] }), byId)).toBe(false)
    }
  })
  it('backlog / ready / ai_running block (work not complete)', () => {
    for (const s of ['backlog', 'ready', 'ai_running'] as const) {
      const byId = indexById([dep('TASK-008', s)])
      expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-008'] }), byId)).toEqual(['TASK-008'])
    }
  })
  it('cancelled or missing dep blocks', () => {
    expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-008'] }), indexById([dep('TASK-008', 'cancelled')]))).toEqual(['TASK-008'])
    expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-999'] }), indexById([]))).toEqual(['TASK-999'])
  })
  it('ignores a self-reference', () => {
    expect(isBlocked(item({ id: 'A', dependsOn: ['A'] }), indexById([]))).toBe(false)
  })
})

describe('unmergedDeps — only review/pr need branch stacking, done is already on main', () => {
  it('returns review/pr deps, excludes done and incomplete', () => {
    const byId = indexById([dep('P1', 'review'), dep('P2', 'pr'), dep('P3', 'done'), dep('P4', 'ready')])
    expect(unmergedDeps(item({ id: 'A', dependsOn: ['P1', 'P2', 'P3', 'P4'] }), byId).sort()).toEqual(['P1', 'P2'])
  })
})

describe('transitiveDependents', () => {
  it('walks the dependency graph (A ← B ← C)', () => {
    const items = [
      item({ id: 'A' }),
      item({ id: 'B', dependsOn: ['A'] }),
      item({ id: 'C', dependsOn: ['B'] }),
      item({ id: 'D' }),
    ]
    expect(transitiveDependents('A', items).map((i) => i.id).sort()).toEqual(['B', 'C'])
    expect(transitiveDependents('D', items)).toEqual([])
  })
})
