import { describe, it, expect } from 'vitest'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from './jobs/candidates.js'
import type { Requirement } from './jobs/requirements.js'
import type { BoardItem } from '../../ui/src/types.js'

const STATUS = `---
component: cafe-service
last_scanned: 2026-06-11
built: 71
tested: 82
---

| Req | State | Tested | Note |
|-----|-------|--------|------|
| CAFE-R3 | done | yes | fine |
| CAFE-R4 | partial | no | signature verify missing |
| CAFE-R9 | done | no | only unit-mapped |
| CAFE-R10 | missing | no | not implemented |

## Drift
- code with no referencing requirement: internal/enrich
`

const REQS = new Map<string, Requirement>([
  ['CAFE-R4', { id: 'CAFE-R4', title: 'Manifest v2 + delta', statement: 'Parses manifest v2.', acceptance: ['delta fetches only changed chunks', 'signature verified'] }],
  ['CAFE-R9', { id: 'CAFE-R9', title: 'gRPC WatchUpdates', statement: 'Server-streams events.', acceptance: ['client gets game-changed event'] }],
  ['CAFE-R10', { id: 'CAFE-R10', title: 'gRPC GetTheme', statement: 'Serves theme.', acceptance: ['theme < 1s'] }],
])

describe('parseStatusDoc', () => {
  it('reads component and rows', () => {
    const doc = parseStatusDoc(STATUS)
    expect(doc.component).toBe('cafe-service')
    expect(doc.rows).toHaveLength(4)
    expect(doc.rows[1]).toEqual({ id: 'CAFE-R4', state: 'partial', tested: false, note: 'signature verify missing' })
    expect(doc.rows[2].tested).toBe(false)
  })
})

describe('buildCandidates', () => {
  const cands = buildCandidates(REQS, [parseStatusDoc(STATUS)])
  it('missing -> implement P1, no separate test candidate', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R10')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'implement', type: 'task', priority: 'P1', component: 'cafe-service' })
    expect(c[0].title).toBe('Implement CAFE-R10: gRPC GetTheme')
    expect(c[0].body).toContain('Req: CAFE-R10')
    expect(c[0].body).toContain('theme < 1s')
  })
  it('partial -> complete P2 AND a test candidate (untested)', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R4')
    expect(c.map((x) => x.kind).sort()).toEqual(['implement', 'test'])
    expect(c.find((x) => x.kind === 'implement')!.title).toBe('Complete CAFE-R4: Manifest v2 + delta')
    expect(c.find((x) => x.kind === 'implement')!.priority).toBe('P2')
  })
  it('done+untested -> test candidate only', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R9')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'test', priority: 'P2' })
    expect(c[0].title).toBe('Add tests for CAFE-R9: gRPC WatchUpdates')
  })
  it('done+tested -> nothing', () => {
    expect(cands.filter((x) => x.reqId === 'CAFE-R3')).toHaveLength(0)
  })
})

describe('dedupeCandidates', () => {
  const cands = buildCandidates(REQS, [parseStatusDoc(STATUS)])
  it('suppresses a candidate already covered by a live item of the same kind', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Implement CAFE-R10: gRPC GetTheme', status: 'ready',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'do it\nReq: CAFE-R10',
    }]
    const out = dedupeCandidates(cands, existing)
    expect(out.find((c) => c.reqId === 'CAFE-R10' && c.kind === 'implement')).toBeUndefined()
    // a test candidate for a different req is still present
    expect(out.find((c) => c.reqId === 'CAFE-R9' && c.kind === 'test')).toBeDefined()
  })
  it('a done item does NOT suppress (gap regressed)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Implement CAFE-R10: gRPC GetTheme', status: 'done',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'Req: CAFE-R10',
    }]
    expect(dedupeCandidates(cands, existing).find((c) => c.reqId === 'CAFE-R10')).toBeDefined()
  })
})
