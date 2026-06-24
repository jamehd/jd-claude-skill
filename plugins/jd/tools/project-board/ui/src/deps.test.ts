import { describe, it, expect } from 'vitest'
import { blockedBy, isBlocked, indexById } from './deps.js'
import type { BoardItem } from './types.js'

function item(p: Partial<BoardItem>): BoardItem {
  return {
    id: 'TASK-001', type: 'task', title: 't', status: 'ready', priority: 'P2',
    component: 'idc_backend', created: '2026-06-24', updated: '2026-06-24', body: 'b', ...p,
  }
}

describe('blockedBy / isBlocked', () => {
  const dep = (id: string, status: BoardItem['status']) => item({ id, status })

  it('no deps → never blocked', () => {
    const byId = indexById([])
    expect(isBlocked(item({ id: 'A' }), byId)).toBe(false)
    expect(blockedBy(item({ id: 'A', dependsOn: [] }), byId)).toEqual([])
  })

  it('satisfied only when every dep is done', () => {
    const byId = indexById([dep('TASK-008', 'done'), dep('TASK-010', 'done')])
    expect(isBlocked(item({ id: 'A', dependsOn: ['TASK-008', 'TASK-010'] }), byId)).toBe(false)
  })

  it('an in-progress / ready dep blocks', () => {
    const byId = indexById([dep('TASK-008', 'pr'), dep('TASK-010', 'ready')])
    expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-008', 'TASK-010'] }), byId)).toEqual(['TASK-008', 'TASK-010'])
  })

  it('a cancelled dep blocks (operator must resolve)', () => {
    const byId = indexById([dep('TASK-008', 'cancelled')])
    expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-008'] }), byId)).toEqual(['TASK-008'])
  })

  it('a missing dep id blocks', () => {
    const byId = indexById([])
    expect(blockedBy(item({ id: 'A', dependsOn: ['TASK-999'] }), byId)).toEqual(['TASK-999'])
  })

  it('ignores a self-reference', () => {
    const byId = indexById([])
    expect(isBlocked(item({ id: 'A', dependsOn: ['A'] }), byId)).toBe(false)
  })
})
