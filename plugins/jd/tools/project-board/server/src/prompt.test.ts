import { describe, it, expect } from 'vitest'
import { buildTaskPrompt } from './jobs/prompt.js'
import type { Requirement } from './jobs/requirements.js'
import type { BoardItem } from '../../ui/src/types.js'

function item(body: string): BoardItem {
  return { id: 'TASK-001', type: 'task', title: 'Do it', status: 'ready', priority: 'P2',
    component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11', body }
}
const REQS = new Map<string, Requirement>([
  ['CAFE-R3', { id: 'CAFE-R3', title: 'GetTheme RPC', statement: 'Serves theme over gRPC.', acceptance: ['theme < 1s', 'tests both paths'] }],
])

describe('buildTaskPrompt with requirements', () => {
  it('injects matched requirements referenced in the body', () => {
    const p = buildTaskPrompt(item('Implement the theme RPC. Req: CAFE-R3'), REQS)
    expect(p).toContain('REQUIREMENTS YOU MUST SATISFY')
    expect(p).toContain('CAFE-R3 — GetTheme RPC')
    expect(p).toContain('Serves theme over gRPC.')
    expect(p).toContain('theme < 1s')
  })
  it('notes unknown ids without throwing', () => {
    const p = buildTaskPrompt(item('Req: CAFE-R99'), REQS)
    expect(p).toContain('CAFE-R99')
    expect(p).toMatch(/not found in docs\/requirements/i)
  })
  it('is unchanged when the body references no requirement ids', () => {
    const withReqs = buildTaskPrompt(item('just do the thing'), REQS)
    const without = buildTaskPrompt(item('just do the thing'))
    expect(withReqs).toBe(without)
    expect(withReqs).not.toContain('REQUIREMENTS YOU MUST SATISFY')
  })
})
