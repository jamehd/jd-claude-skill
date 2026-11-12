import { describe, it, expect } from 'vitest'
import { isDraggable } from './managed.js'

describe('isDraggable', () => {
  it('allows plain tasks outside ai_running and pr', () => {
    expect(isDraggable({ status: 'ready' })).toBe(true)
    expect(isDraggable({ status: 'review', managed: false })).toBe(true)
  })
  it('blocks ai_running and pr', () => {
    expect(isDraggable({ status: 'ai_running' })).toBe(false)
    expect(isDraggable({ status: 'pr' })).toBe(false)
  })
  it('blocks feature-flow managed tasks in any status', () => {
    for (const status of ['backlog', 'ready', 'review', 'done'] as const) {
      expect(isDraggable({ status, managed: true })).toBe(false)
    }
  })
})
